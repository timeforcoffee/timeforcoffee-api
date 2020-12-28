import cacheManager from 'cache-manager'
interface TTLFunction {
    (): number
}

interface CacheArgs {
    key?: string
    ttl?: number | TTLFunction
    cluster?: boolean
}

const memoryStore = cacheManager.caching({ store: 'memory', max: 300, ttl: 10 })

// currently we can't store everything in redis, we need need two redis instances
// small stuff like rokka images can be stored in redis nevertheless for now
// the whole `cluster` thing can be removed, once we have a better/bigger redis for caching

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export const Cache = ({ key, ttl }: CacheArgs = { ttl: 500 }) => {
    const cacheStore = memoryStore
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
                        console.log('Took more than 100 retries... set to non caching currently')
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
                await cacheStore.set(argsKey, '__caching__', { ttl: 10 })

                const result = await method.apply(t, args)
                const calcTtl = typeof ttl === 'function' ? ttl() : ttl
                const toStoreValue = JSON.stringify(result)

                cacheStore.set(argsKey, toStoreValue, { ttl: calcTtl })

                return result
            }
            return callFunc({ args: args, retry: 0, t: this })
        }
    }
}
