import { Injectable, Logger } from '@nestjs/common'
import { IncomingWebhook } from '@slack/webhook'
import { AppConfigService } from '../config/config.service'
import { IncomingWebhookSendArguments } from '@slack/webhook/dist/IncomingWebhook'

const onlySendEveryXSeconds = 60

@Injectable()
export class SlackService {
    private readonly logger = new Logger(SlackService.name)
    constructor(private appConfigService: AppConfigService) {
        this.logger.debug(
            `Sending to Slack URL: ${this.appConfigService.slackNotificationUrl || 'none'}`,
        )
    }
    webhook = this.appConfigService.slackNotificationUrl
        ? new IncomingWebhook(this.appConfigService.slackNotificationUrl)
        : null

    lastCall: number[] = []

    sendAlert(message: IncomingWebhookSendArguments, key: string) {
        // don't send slack message, if no Notificaiton URL is set
        if (!this.webhook) {
            return
        }
        // only send a message every 60 seconds...
        if (
            this.lastCall[key] &&
            this.lastCall[key] + onlySendEveryXSeconds * 1000 > new Date().getTime()
        ) {
            return
        }
        this.lastCall[key] = new Date().getTime()
        this.webhook.send(message)
    }
}
