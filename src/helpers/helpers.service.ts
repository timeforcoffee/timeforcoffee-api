import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosRequestConfig } from 'axios'
import { SlackService } from '../slack/slack.service'

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
}
