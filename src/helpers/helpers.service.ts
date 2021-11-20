import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosRequestConfig } from 'axios'
import { SlackService } from '../slack/slack.service'
import { stripId } from '../ch/ch.service'
import { redisClient } from './helpers.cache'
import os from 'os'

export const DEFAULT_DEPARTURES_LIMIT = 20
@Injectable()
export class HelpersService {
    private readonly logger = new Logger(HelpersService.name)
    constructor(private slackService: SlackService) {}
    async callApi(url: string): Promise<any> {
        const startTime = +new Date()

        try {
            const response = await axios.get(url, { timeout: 6000 })
            const curTime = new Date().getTime()
            this.logger.log(`Got ${url} - Took ${(curTime - startTime) / 1000} sec`)
            return response.data
        } catch (e) {
            this.logger.warn(`${url} threw an error, ${e.message} on ${os.hostname()}`)
            return { error: e.message, source: url }
        }
    }
    async callApiPost(url: string, data: string, config: AxiosRequestConfig = {}): Promise<any> {
        const startTime = +new Date()

        try {
            const response = await axios.post(
                url,
                data,
                Object.assign(
                    {
                        timeout: 5000,
                    },
                    config,
                ),
            )
            const curTime = new Date().getTime()
            this.logger.log(`Got ${url} - Took ${(curTime - startTime) / 1000} sec`)
            return response.data
        } catch (e) {
            const messsage = `${url} threw an error, ${e.message} on ${os.hostname()}`
            this.logger.error(messsage)
            this.slackService.sendAlert({ text: messsage }, 'callApiPost')
            return { error: e.message, source: url }
        }
    }

    /**
     * Gets station limits per station from redis to not getting too many results
     * from the API for not so busy stations (makes it faster for those)
     *
     * This is maybe too much optimization... We could also just return 100 for all (except
     * super busy station like Züri HB, where it should be 200)
     */
    async stationLimit(id: string, defaultLimit: number = null): Promise<string> {
        id = stripId(id)
        if (!defaultLimit) {
            defaultLimit = DEFAULT_DEPARTURES_LIMIT
        }
        if (redisClient && redisClient.connected) {
            const limit = await new Promise<string | null>(resolve => {
                redisClient.get(`station:limit:${id}`, (err, value) => {
                    if (err) {
                        resolve(null)
                        return
                    }
                    resolve(value)
                })
            })
            if (limit) {
                return limit
            }
        }
        // set this in redis, if it's not the default limit, to fill it
        // we can also avoid a DB lookup in ZvvController.stationboardStarttime this way
        // since the one in redis should be the correct one
        if (defaultLimit !== DEFAULT_DEPARTURES_LIMIT) {
            this.logger.debug(
                `Station limit for ${id} was not set in redis, but taken from DB. Set it in redis.`,
            )
            this.setStationLimit(id, defaultLimit)
        }
        return defaultLimit.toString()
    }

    setStationLimit(id: string, limit: number) {
        if (redisClient && redisClient.connected) {
            this.logger.debug(`Set station limit for ${id} to ${limit}`)
            redisClient.set(`station:limit:${id}`, limit.toString())
        }
    }
}
