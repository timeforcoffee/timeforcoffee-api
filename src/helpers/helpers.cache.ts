import cacheManager from 'cache-manager'
import { cloneDeep } from 'lodash'
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

export const Cache = ({ key, ttl, cluster = false }: CacheArgs = { ttl: 500 }) => {
    const cacheStore = memoryStore
    return (target: Record<string, any>, propertyKey: string, descriptor: PropertyDescriptor) => {
        if (!key) {
            key = `${target.constructor.name}/${propertyKey.toString()}`
        }
        const method = descriptor.value

        descriptor.value = async function (...args: any[]) {
            // add args to key. changing method arguments will generate a different key
            const argsKey = `${key}/${JSON.stringify(args)}`
            const cachedValue = await cacheStore.get(argsKey)

            if (cachedValue) {
                try {
                    return JSON.parse(cachedValue)
                } catch (e) {
                    // couldn't decompress, just continue
                }
            }
            const result = await method.apply(this, args)
            const calcTtl = typeof ttl === 'function' ? ttl() : ttl
            const toStoreValue = JSON.stringify(result)
            await cacheStore.set(argsKey, toStoreValue, { ttl: calcTtl })
            return result
        }
    }
}
