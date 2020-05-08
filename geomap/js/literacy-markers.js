// Load the simple-statistic library as an E6 module
import {
  ckmeans,
  mean
} from "https://unpkg.com/simple-statistics@7.0.8/index.js?module";

/*
  Begin loading multiple data files. Promises are
  pending operations that run asynchronously.
*/
const litPromise = d3.csv("data/nyliteracy.csv");
const mapPromise = d3.json("data/NY-36-new-york-counties.geojson");
const townPromise = d3.csv("data/nytowns.csv");
const cityPromise = d3.json("data/geonames-all-cities-with-a-population-1000.json");

/* National average for below-basic prose literacy. */
const nationalAvg = 14;

/* Once all of the data loads, we can build our chart. */
Promise.all([litPromise, mapPromise, townPromise, cityPromise])
  .then(buildChart);

// ---------------- Function definitions ---------------- //

function buildChart([litData, mapJson, townData, cityData]) {
  const data = unifyData(mapJson.features, litData);

  const mapParams = configureMap(mapJson);

  makeMap(data, "illiteracy", d3.schemePuRd[5], mapParams);
  drawTownMarkers(townData, mapParams);
  drawCityMarkers(cityData, mapParams);
  drawMountMarcy(mapParams);
}

/*
 * Draw an image marker for a point of interest (Mt. Marcy, tallest in the state).
 */
function drawMountMarcy(params) {
  // coordinates [lon, lat] for Mount Marcy (Wikipedia, 2020-05-08)
  const point = [-73.923726, 44.112734];

  // Select the map SVG into which we'll add the marker
  const map = d3.select("#choropleth svg");

  // Add a text label for the point of interest
  map.append("image")
    .attr("class", "marker")
    .attr("href", "images/mtn.png")
    .attr("x", params.projection(point)[0] - 8)
    .attr("y", params.projection(point)[1] - 8);
  // Add a text label for the feature of interest
  map.append("text")
    .attr("class", "marker")
    .text("Mt. Marcy")
    .attr("x", params.projection(point)[0])
    .attr("y", params.projection(point)[1] + 8);
}

/*
 * Draw circle markers for towns with area based on population.
 */
function drawTownMarkers(townData, params) {
  // Select the map SVG into which we'll add the markers
  const map = d3.select("#choropleth svg");

  // A scale to make circle area proportional to the data
  const rScale = d3.scaleSqrt()
    .domain([0, d3.max(townData.map(d => parseInt(d.Pop)))])
    .range([0, 6]);

  // Container to hold the town markers
  const g = map.append("g")
    .attr("class", "towns");

  // Add a circle marker for each town
  g.selectAll("circle")
    .data(townData)
    .enter()
    .append("circle")
    .attr("cx", d => params.projection([d.Longitude, d.Latitude])[0])
    .attr("cy", d => params.projection([d.Longitude, d.Latitude])[1])
    .attr("r", d => rScale(d.Pop));

  // Add event listener to toggle display of town markers
  document.querySelector("input[name=towns]").addEventListener("change", evt => {
    if (evt.target.checked) {
      g.style("visibility", "visible");
    } else {
      g.style("visibility", "hidden");
    }
  });
}

/*
 * Draw circle markers for towns with area based on population.
 */
function drawCityMarkers(cityData, params) {
  // Select the map SVG into which we'll add the markers
  const map = d3.select("#choropleth svg");

  // A scale to make circle area proportional to the data
  const rScale = d3.scaleSqrt()
    .domain([0, d3.max(cityData.map(d => d.fields.population))])
    .range([0, 20]);

  // Container to hold the city markers
  const g = map.append("g")
    .attr("class", "cities");

  // Add a circle marker for each city
  g.selectAll("circle")
    .data(cityData)
    .enter()
    .append("circle")
    .attr("cx", d => params.projection(d.geometry.coordinates)[0])
    .attr("cy", d => params.projection(d.geometry.coordinates)[1])
    .attr("r", d => rScale(d.fields.population));

  // Add event listener to toggle display of city markers
  document.querySelector("input[name=cities]").addEventListener("change", evt => {
    if (evt.target.checked) {
      g.style("visibility", "visible");
    } else {
      g.style("visibility", "hidden");
    }
  });
}

/*
 * Build a geographic choropleth map showing the desired attribute.
 */
function makeMap(features, attrib, colorScheme, params) {
  // Create an SVG image to hold the chart
  const map = d3.select("#choropleth").append("svg")
    .attr("viewBox", "0 0 " + params.width + " " + params.height);

  const thresholds = getNaturalThresholds(
    features.map(d => d.properties[attrib]),
    colorScheme.length
  );

  // Define a threshold scale to color the map features
  const color = d3.scaleThreshold()
    .domain(thresholds).range(colorScheme);

  // Bind data and create one path per GeoJSON feature (i.e., NYS county)
  map.selectAll("path")
    .data(features)
    .enter()
    .append("path")
    .attr("d", params.pathGen)
    .style("fill", d => color(d.properties[attrib]))

  // Create and attach a legend for this map
  makeLegend(map, attrib, colorScheme, thresholds, params);
}

/*
 * Join CSV data with JSON features on a common attribute (county name).
 */
function unifyData(features, litData) {
  // Merge the data of interest with the GeoJSON features
  for (let i = 0; i < litData.length; i++) {
    const datum = litData[i];
    // Look for GeoJSON features with counties that are also in data
    for (let j = 0; j < features.length; j++) {
      const jsonCounty = features[j].properties.NAME;
      if (jsonCounty === datum.County) {
        // Copy the data value into the GeoJSON features
        features[j].properties.illiteracy = parseInt(datum.Illiteracy);
        features[j].properties.population = parseInt(datum.Population.replace(/,/g, ''));
        break; // Stop looking through the JSON, move to next county in data
      }
    }
  }
  return features;
}

/*
 * Define the global map parameters.
 */
function configureMap(json) {
  const projection = d3.geoConicEqualArea()
    .rotate([60, 20, 0])
    .fitExtent([[10, 10], [580, 460]], json);

  const pathGen = d3.geoPath().projection(projection);

  // Return map parameters
  return {
    width: 640,
    height: 480,
    projection: projection,
    pathGen: pathGen
  };
}

/*
 * Create a simple legend at the bottom of the chart.
 */
function makeLegend(map, attrib, colorScheme, thresholds, params) {
  // Define a vertical scale for the legend
  const yScale = d3.scaleBand()
    .domain(colorScheme)
    .range([params.height / 2, 0])
    .paddingOuter(1);

  // Add the legend to the map as a group
  const legend = map.append("g")
    .attr("class", "legend")
    .attr("transform", "translate(" + (params.width - 40) + ",0)");

  // Color bands for the legend based on the color scale
  legend.selectAll("rect")
    .data(colorScheme)
    .enter()
    .append("rect")
    .attr("x", 4)
    .attr("y", d => yScale(d))
    .attr("width", 10)
    .attr("height", yScale.bandwidth())
    .style("fill", d => d)

  // Threshold labels for the transitions between bands
  legend.selectAll("text")
    .data(thresholds)
    .enter()
    .append("text")
    .attr("y", (d, i) => yScale(colorScheme[i]))
    .text(d => formatDataLabel(attrib, d));

  // Lower bound label
  legend.append("text")
    .attr("y", params.height / 2 - yScale.bandwidth())
    .text(formatDataLabel(attrib, 0));

  // Upper bound label
  legend.append("text")
    .attr("y", yScale.bandwidth())
    .text("Above");

  legend.append("line")
    .attr("x1", 3)
    .attr("y1", params.height - yScale.bandwidth())
    .attr("x2", 15)
    .attr("y2", params.height - yScale.bandwidth());
}

/*
 * Decide how to format data labels based on the attribute.
 */
function formatDataLabel(attr, val) {
  switch (attr) {
    case "population":
      return (val / 1000).toLocaleString("en-US") + "K";
    case "illiteracy":
    default:
      return val + "%";
  }
}

// ---------------- Function definitions ---------------- //

/*
 * Use ckmeans clustering to determine natural thresholds.
 *
 * The idea is to determine natural clusters in the data domain, and then
 * choose thresholds in between the clusters. These "natural thresholds"
 * might not seem particularly natural for human readers, so we round the
 * raw thresholds by finding the smallest jump between thresholds and then
 * rounding down to the nearest power of 10. This seems to give good results.
 *
 * Note: I've left the console logging in so that you can see how this works.
 */
function getNaturalThresholds(data, n) {
  const clusters = ckmeans(data, n);

  const intervals = clusters.slice(1).map((c, i) => (c[0] - clusters[i][clusters[i].length - 1]));

  const units = intervals.map(d => Math.floor(Math.log10(d)));

  const thresholds = intervals.map((d, i) => clusters[i][clusters[i].length - 1] + d / 2);

  const roundedThresholds = thresholds.map((k, i) => roundToPrecision(k, Math.pow(10, units[i])));

  return roundedThresholds;
}

/*
 * Find the minimum distance between adjacent values in an array.
 */
function minimumInterval(vals) {
  return vals.reduce((acc, d) => {
    const nextInterval = d - acc[0];
    acc[0] = d;
    acc[1] = Math.min(nextInterval, acc[1]);
    return acc;
  }, [0, Infinity])[1];
}

/*
 * Round a numeric value to some desired precision.
 */
function roundToPrecision(x, precision) {
  var y = x + (precision === undefined ? 0.5 : precision / 2);
  return y - (y % (precision === undefined ? 1 : +precision));
}
