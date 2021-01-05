wget -O - https://tfc.chregu.tv/api/helpers/stationlimits  | sqlite3 stations.sqlite
sqlite3 stations.sqlite VACUUM
