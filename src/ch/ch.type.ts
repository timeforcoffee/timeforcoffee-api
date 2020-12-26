export class DepartureType {
    dt: string
    accessible: boolean
    arrival: { scheduled: string; realtime?: string | null }
    name: string
    departure: { scheduled: string; realtime?: string | null }
    source: string
    id: string
    to: string
    colors: { fg: string; bg: string }
    platform: string | null
    type: string
}

export class MetaType {
    station_id: string
    station_name: string
}

export class DeparturesType {
    meta: MetaType
    departures: DepartureType[]
    original?: any
}

export class DeparturesError {
    error: string
}
