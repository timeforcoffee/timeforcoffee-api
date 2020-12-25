import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'

@Injectable()
export class HelpersService {
    private readonly logger = new Logger(HelpersService.name)

    async callApi(url: string): Promise<any> {
        const startTime = +new Date()

        try {
            const response = await axios.get(url)
            const curTime = new Date().getTime()
            this.logger.log(`Got ${url}. Took ${(curTime - startTime) / 1000} sec`)
            return response.data
        } catch (e) {
            this.logger.warn(`${url} threw an error, ${e.message}`)
            return { error: e.message }
        }
    }
}
