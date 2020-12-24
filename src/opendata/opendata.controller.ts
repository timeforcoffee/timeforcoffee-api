import { Controller, Get, Logger, Param } from '@nestjs/common'
import * as moment from 'moment-timezone'
import axios from 'axios'
import { stripId } from '../ch/ch.service'

const connectionsBaseUrl = 'http://transport.opendata.ch/v1/connections?limit=5&direct=1&'

@Controller('/api/ch/')
export class OpendataController {
    private readonly logger = new Logger(OpendataController.name)

    @Get('connections/:from/:to/:datetime')
    async connections(
        @Param('from') from: string,
        @Param('to') to: string,
        @Param('datetime') datetime: string,
    ) {
        const datetimeObj = moment(datetime, 'YYYY-MM-DDThh:mm', 'Europe/Zurich')
        const datetimeMinus10 = datetimeObj.clone().subtract('10', 'minutes')
        const date = datetimeMinus10.format('YYYY-MM-DD')
        const time = datetimeMinus10.format('hh:mm')
        const url = `${connectionsBaseUrl}&from=${from}&to=${to}&date=${date}&time=${time}`
        this.logger.debug(`Get ${url}`)

        const response = await axios.get(url)
        const data = response.data

        return {
            passlist: data.connections
                .filter(connection => {
                    return (
                        connection.sections[0].departure.departureTimestamp === datetimeObj.unix()
                    )
                })
                .map(connection => {
                    //missing arrival thing (the züri-zug thing)
                    return connection.sections[0].journey.passList.map(pass => {
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
    }
}
