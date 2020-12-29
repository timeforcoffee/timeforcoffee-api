import cacheManager from 'cache-manager'
import redisStore from 'cache-manager-ioredis'
import * as dotenv from 'dotenv'
import redis from 'redis'

interface TTLFunction {
    (): number
}

interface CacheArgs {
    key?: string
    ttl?: number | TTLFunction
    cluster?: boolean
}
dotenv.config()

const memoryStore = cacheManager.caching({ store: 'memory', max: 300, ttl: 10 })
const redisHost = process.env.REDIS_HOST || 'redis-service.tfc'
// set this to memory, if you just want to use in memory cache

const storeType: 'redis' | 'memory' = 'redis'
const redisPort = parseInt(process.env.REDIS_PORT) || 6379
const clusterStore = cacheManager.caching({
    store: redisStore,
    host: redisHost,
    port: redisPort,
    ttl: 10,
})

const redisClient = storeType === 'redis' ? redis.createClient(redisPort, redisHost) : null
redisClient.on('error', e => console.log(e))

// currently we can't store everything in redis, we need need two redis instances
// small stuff like rokka images can be stored in redis nevertheless for now
// the whole `cluster` thing can be removed, once we have a better/bigger redis for caching

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export const Cache = ({ key, ttl }: CacheArgs = { ttl: 500 }) => {
    const cacheStore = storeType === 'redis' ? clusterStore : memoryStore
    return (target: Record<string, any>, propertyKey: string, descriptor: PropertyDescriptor) => {
        if (!key) {
            key = `${target.constructor.name}/${propertyKey.toString()}`
        }
        const method = descriptor.value

        descriptor.value = async function (...args: any[]) {
            const callFunc = async function ({
                args,
                retry,
                t,
            }: {
                args: any[]
                retry: number
                t: any
            }) {
                // add args to key. changing method arguments will generate a different key
                const argsKey = `${key}/${JSON.stringify(args)}`
                const cachedValue = await cacheStore.get(argsKey)
                // prevents cache stompeding
                if (cachedValue === '__caching__') {
                    await delay(100)
                    if (retry > 50) {
                        console.log('Took more than 50 retries... set to non caching currently')
                        await cacheStore.del(argsKey)
                    } else {
                        return callFunc({ args, retry: retry + 1, t })
                    }
                }
                if (cachedValue) {
                    try {
                        return JSON.parse(cachedValue)
                    } catch (e) {
                        // couldn't decompress, just continue
                    }
                }
                const cachingKey = '__caching__' + argsKey
                // make sure, we lock it when using redis with a locking key
                if (storeType === 'redis') {
                    const alreadyCaching = !(await new Promise<boolean>((resolve, reject) => {
                        redisClient.setnx(cachingKey, 'a', (err, res) => {
                            if (err) {
                                resolve(false)
                                return
                            }
                            if (res === 1) {
                                resolve(true)
                                redisClient.expire(cachingKey, 5)
                                return
                            }
                            resolve(false)
                        })
                    }))
                    if (alreadyCaching) {
                        await delay(100)
                        if (retry > 50) {
                            if (storeType === 'redis') {
                                console.log(
                                    'Took more than 50 retries... set to non caching currently',
                                )

                                redisClient.del(cachingKey)
                            }
                        } else {
                            return callFunc({ args, retry: retry + 1, t })
                        }
                    }
                }
                await cacheStore.set(argsKey, '__caching__', { ttl: 5 })

                const result = await method.apply(t, args)
                const calcTtl = typeof ttl === 'function' ? ttl() : ttl
                const toStoreValue = JSON.stringify(result)

                await cacheStore.set(argsKey, toStoreValue, { ttl: calcTtl })
                if (storeType === 'redis') {
                    redisClient.del(cachingKey)
                }

                return result
            }
            return callFunc({ args: args, retry: 0, t: this })
        }
    }
}
