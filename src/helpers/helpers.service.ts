import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosRequestConfig } from 'axios'
import { SlackService } from '../slack/slack.service'
import { stripId } from '../ch/ch.service'
import { redisClient } from './helpers.cache'

@Injectable()
export class HelpersService {
    private readonly logger = new Logger(HelpersService.name)
    constructor(private slackService: SlackService) {}
    async callApi(url: string): Promise<any> {
        const startTime = +new Date()

        try {
            const response = await axios.get(url, { timeout: 5000 })
            const curTime = new Date().getTime()
            this.logger.log(`Got ${url} - Took ${(curTime - startTime) / 1000} sec`)
            return response.data
        } catch (e) {
            this.logger.warn(`${url} threw an error, ${e.message}`)
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
            const messsage = `${url} threw an error, ${e.message}`
            this.logger.error(messsage)
            this.slackService.sendAlert({ text: messsage }, 'callApiPost')
            return { error: e.message, source: url }
        }
    }
    async stationLimit(id: string): Promise<string> {
        id = stripId(id)
        switch (id) {
            case '8503000': // Zürich HB
            case '8507000': // bern
            case '8507785': // Bern Hauptbahnof
            case '8500010': //Basel SBB
            case '22': //Basel
            case '8505000': //Luzern
                return '200'
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
        return '30'
    }

    setStationLimit(id: string, limit: string) {
        if (redisClient && redisClient.connected) {
            redisClient.set(`station:limit:${id}`, limit)
        }
    }
}
