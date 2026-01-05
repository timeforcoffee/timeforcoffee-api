import { Test, TestingModule } from '@nestjs/testing'
import { SearchController } from './search.controller'
import { HelpersService } from '../helpers/helpers.service'

describe('SearchController', () => {
    let controller: SearchController
    let helpersService: jest.Mocked<HelpersService>

    beforeEach(async () => {
        const mockHelpersService = {
            callApi: jest.fn(),
            stationLimit: jest.fn().mockResolvedValue('20'),
            setStationLimit: jest.fn(),
        }

        const module: TestingModule = await Test.createTestingModule({
            controllers: [SearchController],
            providers: [
                { provide: HelpersService, useValue: mockHelpersService },
            ],
        }).compile()

        controller = module.get<SearchController>(SearchController)
        helpersService = module.get(HelpersService)
    })

    describe('stationboard', () => {
        it('should return departures for valid station', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Zürich, Limmatplatz' },
                connections: [
                    {
                        terminal: { id: '8591234', name: 'Holzerhurd' },
                        type: 'tram',
                        color: 'ffffff~0000ff',
                        time: '2026-01-05 08:15:00',
                        line: '32',
                        dep_delay: 2,
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.meta.station_id).toBe('8591052')
            expect(result.meta.station_name).toBe('Zürich, Limmatplatz')
            expect(result.departures.length).toBe(1)
            expect(result.departures[0].name).toBe('32')
            expect(result.departures[0].source).toBe('search')
        })

        it('should return error when station not found', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: null,
            })

            const result = await controller.stationboard('9999999')

            expect(result.error).toBeDefined()
            expect(result.code).toBe('NOTFOUND')
        })

        it('should handle API errors', async () => {
            helpersService.callApi.mockResolvedValue({
                error: 'Connection timeout',
                source: 'https://timetable.search.ch/...',
            })

            const result = await controller.stationboard('8591052')

            expect(result.error).toBe('Connection timeout')
        })

        it('should handle empty connections', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures.length).toBe(0)
        })

        it('should handle null connections', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures.length).toBe(0)
        })

        it('should strip leading zeros from station ID', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [],
            })

            await controller.stationboard('008591052')

            expect(helpersService.stationLimit).toHaveBeenCalledWith('8591052', 20)
        })
    })

    describe('color parsing', () => {
        it('should parse 6-digit color codes', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: 'ffffff~0000ff',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].colors.bg).toBe('#ffffff')
            expect(result.departures[0].colors.fg).toBe('#0000ff')
        })

        it('should expand 3-digit color codes', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: 'fff~00f',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].colors.bg).toBe('#ffffff')
            expect(result.departures[0].colors.fg).toBe('#0000ff')
        })

        it('should use default colors when color is empty', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: '~',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].colors.bg).toBe('#ffffff')
            expect(result.departures[0].colors.fg).toBe('#000000')
        })

        it('should use null colors for strain type', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'strain',
                        color: 'ffffff~0000ff',
                        time: '2026-01-05 08:00:00',
                        line: 'S5',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].colors).toBeNull()
        })
    })

    describe('delay calculation', () => {
        it('should calculate realtime with delay', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: 'ffffff~000000',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                        dep_delay: 5,
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].departure.scheduled).toContain('2026-01-05T08:00:00')
            expect(result.departures[0].departure.realtime).toContain('2026-01-05T08:05:00')
        })

        it('should use scheduled time when no delay', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: 'ffffff~000000',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].departure.scheduled).toContain('2026-01-05T08:00:00')
            expect(result.departures[0].departure.realtime).toBe(
                result.departures[0].departure.scheduled,
            )
        })

        it('should set dt to realtime for correct sorting', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: 'ffffff~000000',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                        dep_delay: 5,
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            // dt should use realtime (same as ZVV) for correct sorting
            expect(result.departures[0].dt).toBe(result.departures[0].departure.realtime)
        })
    })

    describe('departure fields', () => {
        it('should set source to search', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: 'ffffff~000000',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].source).toBe('search')
        })

        it('should set accessible to null (not provided by search.ch)', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: 'ffffff~000000',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].accessible).toBeNull()
        })

        it('should set platform to null (not provided by search.ch)', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: 'ffffff~000000',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].platform).toBeNull()
        })

        it('should set arrival scheduled to null', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '123', name: 'Test' },
                        type: 'tram',
                        color: 'ffffff~000000',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].arrival.scheduled).toBeNull()
        })

        it('should map terminal id and name', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [
                    {
                        terminal: { id: '8591234', name: 'Holzerhurd' },
                        type: 'tram',
                        color: 'ffffff~000000',
                        time: '2026-01-05 08:00:00',
                        line: '32',
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect(result.departures[0].id).toBe('8591234')
            expect(result.departures[0].to).toBe('Holzerhurd')
        })
    })

    describe('custom limits', () => {
        it('should use custom default limit when provided', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [],
            })

            await controller.stationboard('8591052', 50)

            expect(helpersService.stationLimit).toHaveBeenCalledWith('8591052', 50)
        })

        it('should pass null to stationLimit when null provided (stationLimit handles default)', async () => {
            helpersService.callApi.mockResolvedValue({
                stop: { name: 'Test Station' },
                connections: [],
            })

            await controller.stationboard('8591052', null)

            // SearchController passes null through; stationLimit handles the default internally
            expect(helpersService.stationLimit).toHaveBeenCalledWith('8591052', null)
        })
    })
})
