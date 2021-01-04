import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class AppConfigService {
    constructor(private readonly config: ConfigService) {}

    get slackNotificationUrl(): string | null {
        return this.config.get<string>('SLACK_NOTIFICATION_URL', null)
    }
}
