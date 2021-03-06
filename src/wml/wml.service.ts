import { Injectable, Logger, Param } from '@nestjs/common'
import { DeparturesType } from '../ch/ch.type'
import { OUTPUT_DATE_FORMAT, stripId } from '../ch/ch.service'
import moment from 'moment-timezone'
import luhn from 'luhn-generator'
import { HelpersService } from '../helpers/helpers.service'

function formatName(data: any): string {
    const splitname = data.name.split(/ /, 2)
    const place = data.place

    if (splitname[0] === place) {
        if (splitname.length > 1) {
            return place + ', ' + splitname[1]
        } else {
            return place
        }
    }
    if (place === data.name) {
        return place
    }
    return place + ', ' + data.name
}

function mapCategory(data: string): string {
    switch (data) {
        case 'NFB':
        case '3':
        case 'VBSG':
            return 'bus'
        default:
            return 'train'
    }
}
function componentToHex(c) {
    const hex = c.toString(16)
    return hex.length == 1 ? '0' + hex : hex
}
function hexy(color?: string[]) {
    if (!color) {
        return null
    }
    return '#' + componentToHex(color[0]) + componentToHex(color[1]) + componentToHex(color[2])
}

const WML_TIME_FORMAT = 'YYYYMMDDTHHmm'

function getTimeFormatted(departure?: string): string | null {
    if (!departure) {
        return null
    }
    return moment.tz(departure, WML_TIME_FORMAT, 'Europe/Zurich').format(OUTPUT_DATE_FORMAT)
}

function mapStationName(station: string) {
    switch (station) {
        case 'St.Gallen':
            return 'St. Gallen'
        case 'Zürich, Zürich HB':
            return 'Zürich HB'
        case 'Zürich, Flughafen':
            return 'Zürich Flughafen'
        case 'Pfäffikon SZ, Pfäffikon':
            return 'Pfäffikon SZ'
        default:
            return station
    }
}

function sanitizeName(line_name: string): string {
    if (line_name.startsWith('S')) {
        return 'S' + line_name.substr(1)
    }
    if (line_name.startsWith('IC')) {
        return 'IC'
    }
    if (line_name.startsWith('IR')) {
        return 'IR'
    }
    return line_name
}

@Injectable()
export class WmlService {
    private readonly logger = new Logger(WmlService.name)
    constructor(private helpersService: HelpersService) {}
    async stationboard(id: string, urlPre: string): Promise<DeparturesType> {
        //Promise<DeparturesType> {
        id = stripId(id)
        let shortId = id.substr(2)
        shortId += '-' + luhn.checksum(shortId)
        const now = moment.tz()
        const url = `${urlPre}${shortId}/${now.format(WML_TIME_FORMAT)}/${now
            .add(2, 'hours')
            .format(WML_TIME_FORMAT)}`

        const data = await this.helpersService.callApi(url)
        if (data.error) {
            return data
        }
        return {
            meta: { station_id: id, station_name: formatName(data) },
            departures: data.departures.map(departure => {
                const product = departure.line
                const scheduled = getTimeFormatted(departure.iso8601_time_sec)
                const realtime = getTimeFormatted(departure.iso8601_real_time_sec)
                return {
                    name: sanitizeName(product.line_name),
                    type: mapCategory(product.transportMapping || product.agency?.id),
                    accessible: null,
                    colors: { fg: hexy(product.colors?.fg), bg: hexy(product.colors?.bg) },
                    to: mapStationName(formatName(departure.end_station)),
                    source: 'wml',
                    platform: departure.platform || null,
                    departure: {
                        scheduled: getTimeFormatted(departure.iso8601_time_sec),
                        realtime: departure.real_time
                            ? getTimeFormatted(departure.iso8601_real_time_sec)
                            : null,
                    },
                    dt: realtime || scheduled,
                }
            }),
            original: data,
        }
    }
}
