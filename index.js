const https = require('https');
const Promise = require('bluebird');

const handleResponse = (statusCode, response, callback) => {
  return callback(null, {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: typeof response === 'string' ? JSON.stringify({ message: response }) : JSON.stringify(response)
  });
};

const makeGetRequest = endpoint => {
  return new Promise((resolve, reject) => {
    https.get(endpoint, response => {
      response.setEncoding('utf8');
      let body = '';
      response.on('data', data => {
        body += data;
      });
      response.on('end', () => {
        try {
          body = JSON.parse(body);
        } catch (e) {
          reject('Could not complete request');
        }
        resolve(body);
      });
    });
  });
};

const getKitchens = () => {
  return makeGetRequest('https://api.staging.clustertruck.com/api/kitchens')
  .then(kitchens => {
    return kitchens.map(kitchen => {
      return {
        id: kitchen.id,
        name: kitchen.name,
        address: `${kitchen.address_1}${kitchen.adress_2 ? ' ' + kitchen.address_2 : ''}`,
        city: kitchen.city,
        state: kitchen.state,
        zip: kitchen.zip_code,
        location: kitchen.location
      };
    });
   })
   .catch(error => {
    throw new Error('Could not complete Cluster Truck kitchen request');
  });
};

const getTravelInfo = (sourceAddress, kitchen) => {
  const destinationAddress = `${kitchen.location.lat},${kitchen.location.lng}`;
  const endpoint = encodeURI(`https://maps.googleapis.com/maps/api/directions/json?origin=${sourceAddress}&destination=${destinationAddress}&key=${process.env.GOOGLE_DIRECTIONS_API_KEY}`);
  return makeGetRequest(endpoint)
  .then(directions => {
    if (!directions || !directions.routes || !directions.routes[0]) {
      return 'Could not locate provided address';
    }
    return {
      distance: directions.routes[0].legs[0].distance,
      duration: directions.routes[0].legs[0].duration
    };
  })
  .catch(error => {
    throw new Error('Could not complete Google API request');
  });
};

const getClosestKitchen = (kitchensWithTravelInfo, metric) => {
  return kitchensWithTravelInfo.reduce((previous, current) => {
    return previous[metric].value < current[metric].value ? previous : current;
  });
};

exports.handler = (event, context, callback) => {
    if (!event || event.httpMethod !== 'POST') {
      return handleResponse(400, 'Invalid request method', callback);
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return handleResponse(400, 'Invalid request body', callback);
    }

    if (!body || !body.address) {
      return handleResponse(400, 'Missing address', callback);
    }

    if (body.metric && ['distance', 'duration'].filter(metric => { return metric === body.metric; }).length === 0) {
      return handleResponse(400, `Metric should be 'distance' (default) or 'duration'`, callback);
    }

    let travelInfoError;

    getKitchens().then(kitchens => {
      Promise.map(kitchens, kitchen => {
        return getTravelInfo(body.address, kitchen)
        .then(travelInfo => {
          if (typeof travelInfo === 'string') {
            travelInfoError = travelInfo;
          }
          return Object.assign(kitchen, travelInfo);
        });
      })
      .then(kitchensWithTravelInfo => {
        if (travelInfoError) {
          return handleResponse(400, travelInfoError, callback);
        }
        const closestKitchen = getClosestKitchen(kitchensWithTravelInfo, body.metric || 'duration');
        return handleResponse(200, closestKitchen, callback);
      })
      .catch(error => {
        return handleResponse(500, error.message || error, callback);
      });
    })
    .catch(error => {
      return handleResponse(500, error.message || error, callback);
    });

};
