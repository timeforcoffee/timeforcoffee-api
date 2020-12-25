import { Controller, Get, Logger, Param } from '@nestjs/common'
import * as moment from 'moment-timezone'
import axios from 'axios'
import { stripId } from '../ch/ch.service'
import { HelpersService } from '../helpers/helpers.service'

const connectionsBaseUrl = 'http://transport.opendata.ch/v1/connections?limit=5&direct=1&'

@Controller('/api/ch/')
export class OpendataController {
    private readonly logger = new Logger(OpendataController.name)

    constructor(private helpersService: HelpersService) {}

    @Get('connections/:from/:to/:datetime/:arrivaldatetime')
    async connectionsWithArrival(
        @Param('from') from: string,
        @Param('to') to: string,
        @Param('datetime') datetime: string,
        @Param('arrivaldatetime') arrivaldatetime: string | null,
    ) {
        const datetimeObj = moment(datetime, 'YYYY-MM-DDThh:mm', 'Europe/Zurich')
        const datetimeArrivalObj = arrivaldatetime
            ? moment(arrivaldatetime, 'YYYY-MM-DDThh:mm', 'Europe/Zurich')
            : null

        const datetimeMinus10 = datetimeObj.clone().subtract('10', 'minutes')
        const date = datetimeMinus10.format('YYYY-MM-DD')
        const time = datetimeMinus10.format('hh:mm')
        const url = `${connectionsBaseUrl}&from=${from}&to=${to}&date=${date}&time=${time}`

        const data = await this.helpersService.callApi(url)

        if (data.error) {
            return data
        }
        return this.extractData(data, from, to, datetimeObj, datetimeArrivalObj)
    }

    private extractData(data, from: string, to: string, datetimeObj, datetimeArrivalObj) {
        const result = {
            passlist: data.connections
                .filter(connection => {
                    const firstRealSection = connection.sections.find(section => {
                        return section.journey !== null
                    })
                    if (datetimeArrivalObj) {
                        return (
                            firstRealSection.departure.departureTimestamp === datetimeObj.unix() &&
                            firstRealSection.arrival.arrivalTimestamp === datetimeArrivalObj.unix()
                        )
                    }
                    return firstRealSection.departure.departureTimestamp === datetimeObj.unix()
                })
                .map(connection => {
                    const firstRealSection = connection.sections.find(section => {
                        return section.journey !== null
                    })
                    return firstRealSection.journey.passList.map(pass => {
                        return {
                            name: pass.station.name,
                            id: stripId(pass.station.id),
                            location: {
                                lat: pass.station.coordinate.x,
                                lng: pass.station.coordinate.y,
                            },
                            departure: {
                                scheduled: pass.departure,
                                realtime: pass.prognosis?.departure || null,
                            },
                            arrival: {
                                scheduled: pass.arrival,
                                realtime: pass.prognosis?.arrival || null,
                            },
                        }
                    })
                }),
        }
        // if nothing found with enddate, fallback to without
        if (datetimeArrivalObj && result.passlist.length === 0) {
            return this.extractData(data, from, to, datetimeObj, null)
        }
        return result
    }

    @Get('connections/:from/:to/:datetime')
    async connections(
        @Param('from') from: string,
        @Param('to') to: string,
        @Param('datetime') datetime: string,
    ) {
        return this.connectionsWithArrival(from, to, datetime, null)
    }
}
