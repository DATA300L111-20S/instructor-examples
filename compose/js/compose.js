// Load the simple-statistic library as an E6 module
import {
  ckmeans
} from "https://unpkg.com/simple-statistics@7.0.8/index.js?module";

// Begin loading the literacy data from CSV
const dataPromise = d3.csv("data/nyliteracy.csv");

// Begin loading the geographic features from GeoJSON
const nysMapPromise = d3.json("data/NY-36-new-york-counties.geojson");

// National average for below-basic prose literacy
const NATIONAL_AVG = 14;

// Collection of colorblind-friendly color palettes
const palettes = {
  blue: d3.schemePuBu[5],
  magenta: d3.schemePuRd[5],
  diverging: d3.schemePiYG[5].reverse(),
  magentaNarrow: d3.schemePuRd[6].filter((c, i) => i % 2 == 1)
};

// Once all of the data loads, we can build our chart
Promise.all([dataPromise, nysMapPromise])
  .then(buildCharts);

// ---------------- Function definitions ---------------- //

/*
 * Main function that creates and display several charts on the page.
 * Input to this function is a list of two data sets - a CSV table and
 * JSON map features - that were loaded and passed along from the Promises.
 */
function buildCharts([csvData, json]) {
  makeBarChart(csvData, palettes.magentaNarrow);

  const data = unifyData(json.features, csvData);
  const mapParams = configureMap(json);

  makeMap(data, "Population", "population", palettes.blue, mapParams);
  makeMap(data, "Illiteracy", "illiteracy", palettes.magenta, mapParams);
  makeMap(data, "+/- Nat'l Avg", "illiteracy", palettes.diverging, mapParams);
}

// ----------------------------- Bar chart ------------------------------ //

/*
 * Main function that creates and display the chart.
 */
function makeBarChart(data, colorScheme) {
  // Establish basic parameters for sizing and layout
  const params = {
    width: d3.select("#bar-chart").node().clientWidth,
    height: 800,
    padLeft: 84,
    padRight: 24,
    padTop: 20,
    labelGap: 8,
  };

  // Create an SVG image to hold the chart
  const barChart = d3.select("#bar-chart").append("svg");

  // Using a view-box allows for responsive re-sizing of the chart
  barChart
    .attr("viewBox", "0 0 " + params.width + " " + params.height)
    .attr("preserveAspectRatio", "xMinYMin meet");

  // Configure vertical and horizontal scales for this chart
  const yScale = d3.scaleBand()
    .domain(data.map(d => d.County))
    .range([params.padTop, params.height])
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(data.map(d => parseInt(d.Illiteracy)))])
    .range([0, params.width - params.padLeft - params.padRight]);

  // Determine thresholds for color-coding the bars
  const thresholds = getNaturalThresholds(
    data.map(d => parseInt(d.Illiteracy)),
    colorScheme.length
  );

  // Define a threshold scale to color the bars
  const color = d3.scaleThreshold()
    .domain(thresholds).range(colorScheme);

  // Groups to hold the bar marks and their labels
  const bars = barChart.selectAll("g.bar")
    .data(data)
    .enter()
    .append("g")
    .attr("class", "bar")
    .attr("transform",
      d => "translate(" + params.padLeft + "," + yScale(d.County) + ")"
    );

  // Marks whose horizontal size encoded the illiteracy rate
  bars.append("rect")
    .attr("x", 1)
    .attr("width", d => xScale(d.Illiteracy))
    .attr("height", yScale.bandwidth())
    .style("fill", d => color(d.Illiteracy))
    .on("mouseover", highlightCounty)
    .on("mouseout", clearHighlighting);

  // Data labels for the bars
  bars.append("text")
    .text(d => d.Illiteracy + "%")
    .attr("x", d => xScale(d.Illiteracy) + params.labelGap)
    .attr("y", yScale.bandwidth() / 2)

  // Create and draw the vertical axis
  barChart.append("g")
    .attr("class", "y axis")
    .attr("transform", "translate(" + params.padLeft + ",0)")
    .call(d3.axisLeft().scale(yScale))
    .selectAll("text")
    .attr("transform", "translate(-72,0)");

  // Reference line annotation
  const refline = barChart.append("g")
    .attr("class", "reference")
    .attr("transform", "translate(" + (xScale(NATIONAL_AVG) + params.padLeft) + "," + params.labelGap + ")")
  // Draw the line
  refline.append("line")
    .attr("y1", 2)
    .attr("y2", params.height);
  // Label the line
  refline.append("text")
    .text("National Average")

  // Register an event listener for sorting the data items
  barChart.on("click", sortBars);

  // Register an event listener for resizing the width of the chart
  window.addEventListener("resize", resize);

  // Flag for toggling the sort criterion for the bars
  let sortByCounty = false;

  /* Auxiliary function to sort the bars. */
  function sortBars() {
    // Check which sort criterion we are using
    const comparator = sortByCounty ?
      (a, b) => d3.ascending(a.County, b.County) :
      (a, b) => d3.descending(parseInt(a.Illiteracy), parseInt(b.Illiteracy));

    // Update the vertical scale based on the sorted data
    yScale.domain(data.sort(comparator).map(d => d.County));

    // Re-draw the vertical axis
    barChart.select(".y.axis")
      .transition()
      .duration(1000)
      .call(d3.axisLeft().scale(yScale));

    // Sort the bars by the new criterion
    barChart.selectAll(".bar")
      .sort(comparator)
      .transition()
      .duration(1000)
      .attr("transform",
        (d, i) => "translate(" + params.padLeft + "," + yScale(d.County) + ")"
      )

    // Keep track of which sort we just did
    sortByCounty = !sortByCounty;
  }

  function resize() {
    const width = d3.select("#bar-chart svg").node().clientWidth;

    barChart.attr("viewBox", "0 0 " + width + " " + params.height)

    // Update the range of the scale with new width/height
    xScale.range([params.padLeft, width - params.padLeft - params.padRight]);

    // Recalculate and update the widths of the bars
    bars.selectAll("rect")
      .attr("width", d => xScale(d.Illiteracy))
    bars.selectAll("text")
      .attr("x", d => xScale(d.Illiteracy) + params.labelGap)
    refline.attr("transform", "translate(" + (xScale(NATIONAL_AVG) + params.padLeft) + "," + params.labelGap + ")")
  }
}

// -------------------------- Geographic maps --------------------------- //

/*
 * Join CSV data with JSON features on a common attribute (county name).
 */
function unifyData(features, csvData) {
  // Merge the data of interest with the GeoJSON features
  for (let i = 0; i < csvData.length; i++) {
    const datum = csvData[i];
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
    .fitExtent([[10, 10], [230, 170]], json);

  const pathGen = d3.geoPath().projection(projection);

  // Return map parameters
  return {
    width: 280,
    height: 180,
    projection: projection,
    pathGen: pathGen
  };
}

/*
 * Build a geographic choropleth map showing the desired attribute.
 */
function makeMap(features, title, attrib, colorScheme, params) {
  // Create an SVG image to hold the chart
  const map = d3.select("#small-multiples").append("svg")
    .attr("viewBox", "0 0 " + params.width + " " + params.height)

  // Map title positioned at the upper-left
  map.append("text")
    .attr("class", "title")
    .attr("x", 10)
    .attr("y", 10)
    .text(title);

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
    .on("mouseover", highlightCounty)
    .on("mouseout", clearHighlighting)

  // Create and attach a legend for this map
  makeLegend(map, attrib, colorScheme, thresholds, params);
}

/*
 * Create a simple legend at the bottom of the chart.
 */
function makeLegend(map, attrib, colorScheme, thresholds, params) {
  // Define a vertical scale for the legend
  const yScale = d3.scaleBand()
    .domain(colorScheme)
    .range([params.height, 0])
    .paddingOuter(1);

  // Add the legend to the map as a group
  const legend = map.append("g")
    .attr("class", "legend")
    .attr("transform", "translate(" + (params.width - 20) + ",0)");

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
    .on("mouseover", highlightBand)
    .on("mouseout", clearBand);

  // Threshold labels for the transitions between bands
  legend.selectAll("text")
    .data(thresholds)
    .enter()
    .append("text")
    .attr("y", (d, i) => yScale(colorScheme[i]))
    .text(d => formatDataLabel(attrib, d));

  // Lower bound label
  legend.append("text")
    .attr("y", params.height - yScale.bandwidth())
    .text(formatDataLabel(attrib, 0));

  // Upper bound label
  legend.append("text")
    .attr("y", yScale.bandwidth())
    .text("Above");
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

// ------------------------- User interactions -------------------------- //

/*
 * Highlights the selected county across all charts to focus the reader.
 * This function dynamically adds/removes class names to trigger CSS styles.
 */
function highlightCounty() {
  const selection = d3.select(this);
  const county = selection.node().tagName === "rect" ? selection.datum().County : selection.datum().properties.NAME;

  const bars = d3.selectAll("#bar-chart .bar");
  bars
    .attr("class", d => d.County === county ? "bar focus" : "bar unfocus");

  const tickLabels = d3.selectAll("#bar-chart .tick text");
  tickLabels.attr("class", d => d === county ? "focus" : "");

  const paths = d3.selectAll("#small-multiples path");
  paths
    .attr("class", d => d.properties.NAME === county ? "focus" : "unfocus");

  d3.selectAll("#small-multiples path.focus").raise();
}

/*
 * Clears the highlighting from all charts to remove focus.
 * This function dynamically removes class names to disable CSS styles.
 */
function clearHighlighting() {
  d3.selectAll("#small-multiples path")
    .attr("class", "");
  d3.selectAll("#bar-chart .bar")
    .attr("class", "bar");
  d3.selectAll("#bar-chart .tick .focus")
    .attr("class", "");
}

/*
 *
 */
function highlightBand() {
  const activeMap = this.parentNode.parentNode;
  const band = d3.select(this).style("fill");

  const matchingCounties = [];
  d3.select(activeMap).selectAll("path")
    .each(function (d, i) {
      const fill = d3.select(this).style("fill");
      if (fill === band)
        matchingCounties.push(d.properties.NAME);
    });

  d3.selectAll("#small-multiples path")
    .attr("class", (d, i) => {
      return matchingCounties.includes(d.properties.NAME) ? "" : "unfocus";
    });

  d3.selectAll("#small-multiples rect")
    .attr("class", function () {
      const fill = d3.select(this).style("fill");
      return fill !== band ? "unfocus" : "";
    });
}

/*
 *
 */
function clearBand() {
  d3.selectAll("#small-multiples .unfocus")
    .attr("class", "");
}

// --------------------- Clustering and thresholds ---------------------- //

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
  console.log("Data:", data);

  const clusters = ckmeans(data, n);
  console.log("Clusters:", clusters);

  const intervals = clusters.slice(1).map((c, i) => (c[0] - clusters[i][clusters[i].length - 1]));
  console.log("Intervals:", intervals);
  console.log(Math.min(...intervals));

  const units = intervals.map(d => Math.floor(Math.log10(d)));
  console.log("Units:", units);

  const thresholds = intervals.map((d, i) => clusters[i][clusters[i].length - 1] + d / 2);
  console.log("Raw thresholds:", thresholds);

  const roundedThresholds = thresholds.map((k, i) => roundToPrecision(k, Math.pow(10, units[i])));
  console.log("Rounded thresholds:", roundedThresholds);

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
