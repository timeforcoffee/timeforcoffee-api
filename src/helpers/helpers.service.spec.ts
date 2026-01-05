import { Test, TestingModule } from '@nestjs/testing'
import { HelpersService, DEFAULT_DEPARTURES_LIMIT } from './helpers.service'
import { SlackService } from '../slack/slack.service'
import axios from 'axios'

// Mock axios
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

// Mock redis client
jest.mock('./helpers.cache', () => ({
    redisClient: {
        connected: true,
        get: jest.fn(),
        set: jest.fn(),
    },
}))

describe('HelpersService', () => {
    let service: HelpersService
    let slackService: jest.Mocked<SlackService>
    let redisClient: any

    beforeEach(async () => {
        const mockSlackService = {
            sendAlert: jest.fn(),
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                HelpersService,
                { provide: SlackService, useValue: mockSlackService },
            ],
        }).compile()

        service = module.get<HelpersService>(HelpersService)
        slackService = module.get(SlackService)
        redisClient = require('./helpers.cache').redisClient
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('callApi', () => {
        it('should return data on successful GET request', async () => {
            const mockData = { Departure: [] }
            mockedAxios.get.mockResolvedValue({ data: mockData })

            const result = await service.callApi('https://api.example.com/data')

            expect(result).toEqual(mockData)
            expect(mockedAxios.get).toHaveBeenCalledWith('https://api.example.com/data', {
                timeout: 6000,
            })
        })

        it('should return error object on request failure', async () => {
            mockedAxios.get.mockRejectedValue(new Error('Connection timeout'))

            const result = await service.callApi('https://api.example.com/data')

            expect(result.error).toBe('Connection timeout')
            expect(result.source).toBe('https://api.example.com/data')
        })

        it('should handle network errors', async () => {
            mockedAxios.get.mockRejectedValue(new Error('ENOTFOUND'))

            const result = await service.callApi('https://invalid.example.com')

            expect(result.error).toBe('ENOTFOUND')
        })

        it('should use 6 second timeout', async () => {
            mockedAxios.get.mockResolvedValue({ data: {} })

            await service.callApi('https://api.example.com')

            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ timeout: 6000 }),
            )
        })
    })

    describe('callApiPost', () => {
        it('should return data on successful POST request', async () => {
            const mockData = { result: 'success' }
            mockedAxios.post.mockResolvedValue({ data: mockData })

            const result = await service.callApiPost(
                'https://api.example.com/data',
                '<xml>data</xml>',
            )

            expect(result).toEqual(mockData)
        })

        it('should merge custom config with defaults', async () => {
            mockedAxios.post.mockResolvedValue({ data: {} })

            await service.callApiPost('https://api.example.com', 'data', {
                headers: { 'Content-Type': 'text/xml' },
            })

            expect(mockedAxios.post).toHaveBeenCalledWith(
                'https://api.example.com',
                'data',
                expect.objectContaining({
                    timeout: 5000,
                    headers: { 'Content-Type': 'text/xml' },
                }),
            )
        })

        it('should return error object on request failure', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Server error'))

            const result = await service.callApiPost('https://api.example.com', 'data')

            expect(result.error).toBe('Server error')
            expect(result.source).toBe('https://api.example.com')
        })

        it('should send Slack alert on POST failure', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Connection failed'))

            await service.callApiPost('https://api.example.com', 'data')

            expect(slackService.sendAlert).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: expect.stringContaining('Connection failed'),
                }),
                'callApiPost',
            )
        })

        it('should use 5 second timeout by default', async () => {
            mockedAxios.post.mockResolvedValue({ data: {} })

            await service.callApiPost('https://api.example.com', 'data')

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.objectContaining({ timeout: 5000 }),
            )
        })
    })

    describe('stationLimit', () => {
        it('should return limit from Redis when connected', async () => {
            redisClient.connected = true
            redisClient.get.mockImplementation((key, callback) => {
                callback(null, '50')
            })

            const result = await service.stationLimit('8591052')

            expect(result).toBe('50')
        })

        it('should return default limit when not in Redis', async () => {
            redisClient.connected = true
            redisClient.get.mockImplementation((key, callback) => {
                callback(null, null)
            })

            const result = await service.stationLimit('8591052')

            expect(result).toBe(DEFAULT_DEPARTURES_LIMIT.toString())
        })

        it('should return default limit on Redis error', async () => {
            redisClient.connected = true
            redisClient.get.mockImplementation((key, callback) => {
                callback(new Error('Redis error'), null)
            })

            const result = await service.stationLimit('8591052')

            expect(result).toBe(DEFAULT_DEPARTURES_LIMIT.toString())
        })

        it('should use custom default limit when provided', async () => {
            redisClient.connected = true
            redisClient.get.mockImplementation((key, callback) => {
                callback(null, null)
            })

            const result = await service.stationLimit('8591052', 100)

            expect(result).toBe('100')
        })

        it('should set non-default limit in Redis', async () => {
            redisClient.connected = true
            redisClient.get.mockImplementation((key, callback) => {
                callback(null, null)
            })

            await service.stationLimit('8591052', 50)

            expect(redisClient.set).toHaveBeenCalledWith('station:limit:8591052', '50')
        })

        it('should not set default limit in Redis', async () => {
            redisClient.connected = true
            redisClient.get.mockImplementation((key, callback) => {
                callback(null, null)
            })

            await service.stationLimit('8591052', DEFAULT_DEPARTURES_LIMIT)

            expect(redisClient.set).not.toHaveBeenCalled()
        })

        it('should use default limit when null provided', async () => {
            redisClient.connected = true
            redisClient.get.mockImplementation((key, callback) => {
                callback(null, null)
            })

            const result = await service.stationLimit('8591052', null)

            expect(result).toBe(DEFAULT_DEPARTURES_LIMIT.toString())
        })

        it('should strip leading zeros from station ID', async () => {
            redisClient.connected = true
            redisClient.get.mockImplementation((key, callback) => {
                expect(key).toBe('station:limit:8591052')
                callback(null, '30')
            })

            await service.stationLimit('008591052')

            expect(redisClient.get).toHaveBeenCalledWith(
                'station:limit:8591052',
                expect.any(Function),
            )
        })

        it('should fall back to default when Redis not connected', async () => {
            redisClient.connected = false

            const result = await service.stationLimit('8591052')

            expect(result).toBe(DEFAULT_DEPARTURES_LIMIT.toString())
            expect(redisClient.get).not.toHaveBeenCalled()
        })
    })

    describe('setStationLimit', () => {
        it('should set limit in Redis when connected', () => {
            redisClient.connected = true

            service.setStationLimit('8591052', 50)

            expect(redisClient.set).toHaveBeenCalledWith('station:limit:8591052', '50')
        })

        it('should not set limit when Redis not connected', () => {
            redisClient.connected = false

            service.setStationLimit('8591052', 50)

            expect(redisClient.set).not.toHaveBeenCalled()
        })

        it('should convert limit to string', () => {
            redisClient.connected = true

            service.setStationLimit('8591052', 100)

            expect(redisClient.set).toHaveBeenCalledWith('station:limit:8591052', '100')
        })
    })

    describe('DEFAULT_DEPARTURES_LIMIT', () => {
        it('should be 20', () => {
            expect(DEFAULT_DEPARTURES_LIMIT).toBe(20)
        })
    })
})
