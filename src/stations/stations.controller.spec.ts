import { Test, TestingModule } from '@nestjs/testing'
import { StationsController } from './stations.controller'
import { HelpersService } from '../helpers/helpers.service'

// Mock the cache decorator to pass through
jest.mock('../helpers/helpers.cache', () => ({
    Cache: () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        // Return descriptor unchanged - no caching
        return descriptor
    },
    redisClient: {
        connected: false,
    },
}))

describe('StationsController', () => {
    let controller: StationsController
    let helpersService: jest.Mocked<HelpersService>

    beforeEach(async () => {
        const mockHelpersService = {
            callApi: jest.fn(),
        }

        const module: TestingModule = await Test.createTestingModule({
            controllers: [StationsController],
            providers: [
                { provide: HelpersService, useValue: mockHelpersService },
            ],
        }).compile()

        controller = module.get<StationsController>(StationsController)
        helpersService = module.get(HelpersService)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('findStation', () => {
        it('should return stations for valid search', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [
                    {
                        StopLocation: {
                            extId: '8591052',
                            name: 'Zürich, Limmatplatz',
                            lon: 8.5308,
                            lat: 47.3844,
                        },
                    },
                    {
                        StopLocation: {
                            extId: '8591053',
                            name: 'Zürich, Limmatstrasse',
                            lon: 8.5320,
                            lat: 47.3850,
                        },
                    },
                ],
            })

            const result = await controller.findStation('Limmat')

            expect(result.stations.length).toBe(2)
            expect(result.stations[0].id).toBe('8591052')
            expect(result.stations[0].name).toBe('Zürich, Limmatplatz')
            expect(result.stations[0].location.lon).toBe(8.5308)
            expect(result.stations[0].location.lat).toBe(47.3844)
        })

        it('should handle empty search results', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [],
            })

            const result = await controller.findStation('nonexistent')

            expect(result.stations.length).toBe(0)
        })

        it('should handle null stopLocationOrCoordLocation', async () => {
            helpersService.callApi.mockResolvedValue({})

            const result = await controller.findStation('test')

            expect(result.stations).toBeUndefined()
        })

        it('should return error when API fails', async () => {
            helpersService.callApi.mockResolvedValue({
                error: 'Connection timeout',
                source: 'https://fpbe.zvv.ch/...',
            })

            const result = await controller.findStation('test')

            expect(result.error).toBe('Connection timeout')
        })

        it('should filter out stations without extId', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [
                    {
                        StopLocation: {
                            extId: '8591052',
                            name: 'Valid Station',
                            lon: 8.5308,
                            lat: 47.3844,
                        },
                    },
                    {
                        StopLocation: {
                            extId: null,
                            name: 'Invalid Station',
                            lon: 8.5320,
                            lat: 47.3850,
                        },
                    },
                    {
                        StopLocation: {
                            name: 'Missing extId Station',
                            lon: 8.5330,
                            lat: 47.3860,
                        },
                    },
                ],
            })

            const result = await controller.findStation('Station')

            expect(result.stations.length).toBe(1)
            expect(result.stations[0].id).toBe('8591052')
        })

        it('should replace spaces with + in search query', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [],
            })

            await controller.findStation('Zürich HB')

            expect(helpersService.callApi).toHaveBeenCalledWith(
                expect.stringContaining('Zürich+HB'),
            )
        })

        it('should replace * with %3F in search query', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [],
            })

            await controller.findStation('Zürich*')

            expect(helpersService.callApi).toHaveBeenCalledWith(
                expect.stringContaining('Zürich%3F'),
            )
        })

        it('should use correct API URL', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [],
            })

            await controller.findStation('test')

            expect(helpersService.callApi).toHaveBeenCalledWith(
                expect.stringContaining('https://fpbe.zvv.ch/restproxy/location.name'),
            )
        })

        it('should include required API parameters', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [],
            })

            await controller.findStation('test')

            const url = helpersService.callApi.mock.calls[0][0]
            expect(url).toContain('format=json')
            expect(url).toContain('accessId=OFPubique')
            expect(url).toContain('type=S')
        })

        it('should map location coordinates correctly', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [
                    {
                        StopLocation: {
                            extId: '8503000',
                            name: 'Zürich HB',
                            lon: 8.540192,
                            lat: 47.378177,
                        },
                    },
                ],
            })

            const result = await controller.findStation('Zürich HB')

            expect(result.stations[0].location).toEqual({
                lon: 8.540192,
                lat: 47.378177,
            })
        })
    })

    describe('multiple stations', () => {
        it('should return multiple matching stations', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [
                    {
                        StopLocation: {
                            extId: '8503000',
                            name: 'Zürich HB',
                            lon: 8.54,
                            lat: 47.38,
                        },
                    },
                    {
                        StopLocation: {
                            extId: '8503001',
                            name: 'Zürich Hardbrücke',
                            lon: 8.52,
                            lat: 47.39,
                        },
                    },
                    {
                        StopLocation: {
                            extId: '8503002',
                            name: 'Zürich Oerlikon',
                            lon: 8.55,
                            lat: 47.40,
                        },
                    },
                ],
            })

            const result = await controller.findStation('Zürich')

            expect(result.stations.length).toBe(3)
        })

        it('should preserve station order from API', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [
                    {
                        StopLocation: {
                            extId: '1',
                            name: 'First',
                            lon: 8,
                            lat: 47,
                        },
                    },
                    {
                        StopLocation: {
                            extId: '2',
                            name: 'Second',
                            lon: 8,
                            lat: 47,
                        },
                    },
                    {
                        StopLocation: {
                            extId: '3',
                            name: 'Third',
                            lon: 8,
                            lat: 47,
                        },
                    },
                ],
            })

            const result = await controller.findStation('test')

            expect(result.stations[0].name).toBe('First')
            expect(result.stations[1].name).toBe('Second')
            expect(result.stations[2].name).toBe('Third')
        })
    })

    describe('special characters', () => {
        it('should handle German umlauts in station names', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [
                    {
                        StopLocation: {
                            extId: '8591052',
                            name: 'Zürich, Löwenplatz',
                            lon: 8.53,
                            lat: 47.38,
                        },
                    },
                ],
            })

            const result = await controller.findStation('Löwen')

            expect(result.stations[0].name).toBe('Zürich, Löwenplatz')
        })

        it('should handle French accents in station names', async () => {
            helpersService.callApi.mockResolvedValue({
                stopLocationOrCoordLocation: [
                    {
                        StopLocation: {
                            extId: '8501000',
                            name: 'Genève',
                            lon: 6.14,
                            lat: 46.21,
                        },
                    },
                ],
            })

            const result = await controller.findStation('Genève')

            expect(result.stations[0].name).toBe('Genève')
        })
    })
})
