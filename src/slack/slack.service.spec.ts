import { Test, TestingModule } from '@nestjs/testing'
import { SlackService } from './slack.service'
import { AppConfigService } from '../config/config.service'

// Mock the Slack webhook
jest.mock('@slack/webhook', () => ({
    IncomingWebhook: jest.fn().mockImplementation(() => ({
        send: jest.fn(),
    })),
}))

describe('SlackService', () => {
    let service: SlackService
    let mockWebhookSend: jest.Mock

    describe('with Slack URL configured', () => {
        beforeEach(async () => {
            const mockConfigService = {
                slackNotificationUrl: 'https://hooks.slack.com/services/test',
            }

            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    SlackService,
                    { provide: AppConfigService, useValue: mockConfigService },
                ],
            }).compile()

            service = module.get<SlackService>(SlackService)
            mockWebhookSend = service.webhook.send as jest.Mock
        })

        afterEach(() => {
            jest.clearAllMocks()
        })

        describe('sendAlert', () => {
            it('should send alert to Slack', () => {
                const message = { text: 'Test alert' }

                service.sendAlert(message, 'testKey')

                expect(mockWebhookSend).toHaveBeenCalledWith(message)
            })

            it('should rate limit alerts with same key', () => {
                const message = { text: 'Test alert' }

                service.sendAlert(message, 'rateLimit')
                service.sendAlert(message, 'rateLimit')
                service.sendAlert(message, 'rateLimit')

                expect(mockWebhookSend).toHaveBeenCalledTimes(1)
            })

            it('should allow alerts with different keys', () => {
                const message1 = { text: 'Alert 1' }
                const message2 = { text: 'Alert 2' }

                service.sendAlert(message1, 'key1')
                service.sendAlert(message2, 'key2')

                expect(mockWebhookSend).toHaveBeenCalledTimes(2)
            })

            it('should allow alert after rate limit period (60 seconds)', () => {
                jest.useFakeTimers()
                const message = { text: 'Test alert' }

                service.sendAlert(message, 'timedKey')
                expect(mockWebhookSend).toHaveBeenCalledTimes(1)

                // Advance time by 59 seconds - still rate limited
                jest.advanceTimersByTime(59000)
                service.sendAlert(message, 'timedKey')
                expect(mockWebhookSend).toHaveBeenCalledTimes(1)

                // Advance time past 60 seconds
                jest.advanceTimersByTime(2000)
                service.sendAlert(message, 'timedKey')
                expect(mockWebhookSend).toHaveBeenCalledTimes(2)

                jest.useRealTimers()
            })

            it('should track last call time per key', () => {
                jest.useFakeTimers()
                const message = { text: 'Test alert' }

                service.sendAlert(message, 'keyA')
                jest.advanceTimersByTime(30000)
                service.sendAlert(message, 'keyB')
                jest.advanceTimersByTime(35000)

                // keyA should now be past rate limit (65s total)
                service.sendAlert(message, 'keyA')
                // keyB should still be rate limited (35s)
                service.sendAlert(message, 'keyB')

                expect(mockWebhookSend).toHaveBeenCalledTimes(3)

                jest.useRealTimers()
            })

            it('should handle complex message objects', () => {
                const message = {
                    text: 'Alert',
                    attachments: [
                        {
                            color: 'danger',
                            fields: [{ title: 'Error', value: 'Something failed' }],
                        },
                    ],
                }

                service.sendAlert(message, 'complexKey')

                expect(mockWebhookSend).toHaveBeenCalledWith(message)
            })
        })
    })

    describe('without Slack URL configured', () => {
        beforeEach(async () => {
            const mockConfigService = {
                slackNotificationUrl: null,
            }

            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    SlackService,
                    { provide: AppConfigService, useValue: mockConfigService },
                ],
            }).compile()

            service = module.get<SlackService>(SlackService)
        })

        it('should not create webhook when URL not configured', () => {
            expect(service.webhook).toBeNull()
        })

        it('should not send alerts when webhook not configured', () => {
            // Should not throw
            service.sendAlert({ text: 'Test' }, 'key')
        })
    })

    describe('with empty Slack URL', () => {
        beforeEach(async () => {
            const mockConfigService = {
                slackNotificationUrl: '',
            }

            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    SlackService,
                    { provide: AppConfigService, useValue: mockConfigService },
                ],
            }).compile()

            service = module.get<SlackService>(SlackService)
        })

        it('should not create webhook when URL is empty', () => {
            expect(service.webhook).toBeNull()
        })
    })
})
