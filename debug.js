const index = require('./index');

const event = {
  httpMethod: 'POST',
  body: JSON.stringify({
    address: 'Pasadena, CA',
    metric: 'duration'
  })
};

return index.handler(event, null, (error, results) => {
  console.log('debug results');
  console.log(JSON.parse(results.body));
});
