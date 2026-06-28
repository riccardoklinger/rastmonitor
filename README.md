# rastmonitor

## What this does   
rastmonitor is subscribing to the SID service from toll collect. it stores the paraking places in a "static table" which is only updaterd once a day. the more volatile data is called from the service every 15min. The volatile data consists of the current usage / filling in % of the parking spots. normally: in the night these value is around 100% or above. daily it is way below.
The data is stored in a postgres database.
the data is visualized in a minimal webmapping application based on next.js with map libre.
the whole infrastructure is run in docker containers to make maintenance as easy as possible. 

## datasource

static data: https://mobilithek.info:8443/mobilithek/api/v1.0/subscription/soap/1006362396091736064/clientPullService 
dynamic data: https://mobilithek.info:8443/mobilithek/api/v1.0/subscription/soap/1006362327707783168/clientPullService 

The data description is in xsd in /static/xsd for the dynamic (parkingStatus) and static (ParkingTable) data.