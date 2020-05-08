// Load the simple-statistic library as an E6 module
import {
  ckmeans,
  mean
} from "https://unpkg.com/simple-statistics@7.0.8/index.js?module";

/* National average for below-basic prose literacy. */
const US_AVG = 14;
const NY_AVG = 22;

/*
  Begin loading data. Promises are pending operations that run asynchronously.
*/
d3.csv("data/nyliteracy.csv")
  .then(buildWhiskerPlot);

// ---------------- Function definitions ---------------- //

/*
 * Main function to build box-and-whisker plot from the data.
 */
function buildWhiskerPlot(dataset) {
  // preprocess the data
  dataset.forEach(row => {
    row.Population = parseInt(row.Population.replace(/,/g, ""));
    row.Illiteracy = parseInt(row.Illiteracy);
  });

  dataset.sort((a, b) => a.Population - b.Population);

  // chart parameters
  const width = 900,
    height = 300,
    padBtm = 75,
    padSides = 40,
    padTop = 5;

  const color = d3.scaleThreshold()
    .range(d3.schemePuRd[6].slice(1));

  const thresholds = getNaturalThresholds(
    dataset.map(d => d.Illiteracy),
    color.range().length
  );

  color.domain(thresholds);

  // create the SVG graphic
  const whiskerPlot = d3.select("#whisker-plot")
    .append("svg")
    .attr("viewBox", "0 0 " + width + " " + height);


  // functions for extracting the desired attributes
  const xValue = d => d.County;
  const yValue = d => d.Illiteracy;
  const ubValue = d => d["Upper bound"];
  const lbValue = d => d["Lower bound"];

  // set up x-scale, rounding up to next multiple of 100K
  const xScale = d3.scaleBand()
    .domain(dataset.map(xValue))
    .range([padSides, width - padSides])
    .paddingInner(0.25)
    .paddingOuter(0.5);

  // set up y-scale, rounding up to next multiple of 10
  const yScale = d3.scaleLinear()
    .domain([0, Math.ceil(d3.max(dataset.map(ubValue)) / 10) * 10])
    .range([height - padBtm, padTop]);

  // create x-axis with title
  whiskerPlot.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + (height - padBtm) + ")")
    .call(d3.axisBottom().scale(xScale))

  // create y-axis with title
  whiskerPlot.append("g")
    .attr("class", "y axis")
    .attr("transform", "translate(" + padSides + ",0)")
    .call(d3.axisLeft().scale(yScale))
    .append("text")
    .text("% Below Basic Literacy")
    .attr("class", "title")
    .attr("x", -(height - padBtm) / 2)
    .attr("y", -padSides);

  // draw horizontal reference line and label
  whiskerPlot.append("line")
    .attr("class", "reference")
    .attr("x1", xScale.range()[0])
    .attr("y1", yScale(US_AVG))
    .attr("x2", xScale.range()[1])
    .attr("y2", yScale(US_AVG))
    .style("stroke", "#4d9221");
  whiskerPlot.append("text")
    .attr("class", "reference")
    .text("Nat'l Avg")
    .attr("x", width)
    .attr("y", yScale(US_AVG))
    .style("fill", "#4d9221");

  // draw horizontal reference line and label
  whiskerPlot.append("line")
    .attr("class", "reference")
    .attr("x1", xScale.range()[0])
    .attr("y1", yScale(NY_AVG))
    .attr("x2", xScale.range()[1])
    .attr("y2", yScale(NY_AVG))
    .style("stroke", color(NY_AVG));
  whiskerPlot.append("text")
    .attr("class", "reference")
    .text("State Avg")
    .attr("x", width)
    .attr("y", yScale(NY_AVG))
    .style("fill", color(NY_AVG));

  // draw the vertical "whisker" marks
  whiskerPlot.append("g")
    .attr("class", "spreads")
    .selectAll("line")
    .data(dataset)
    .enter()
    .append("line")
    .attr("x1", d => xScale(xValue(d)) + xScale.bandwidth() / 2)
    .attr("y1", d => yScale(lbValue(d)))
    .attr("x2", d => xScale(xValue(d)) + xScale.bandwidth() / 2)
    .attr("y2", d => yScale(ubValue(d)))
    .style("stroke", "#ccc"); //d => color(d.Illiteracy));

  // draw the upper "whisker" marks
  whiskerPlot.append("g")
    .attr("class", "upperbounds")
    .selectAll("line")
    .data(dataset)
    .enter()
    .append("line")
    .attr("x1", d => xScale(xValue(d)))
    .attr("y1", d => yScale(ubValue(d)))
    .attr("x2", d => xScale(xValue(d)) + xScale.bandwidth())
    .attr("y2", d => yScale(ubValue(d)))
    .style("stroke", d => color(d["Upper bound"]));

  // draw the lower "whisker" marks
  whiskerPlot.append("g")
    .attr("class", "lowerbounds")
    .selectAll("line")
    .data(dataset)
    .enter()
    .append("line")
    .attr("x1", d => xScale(xValue(d)))
    .attr("y1", d => yScale(lbValue(d)))
    .attr("x2", d => xScale(xValue(d)) + xScale.bandwidth())
    .attr("y2", d => yScale(lbValue(d)))
    .style("stroke", d => color(d["Lower bound"]));

  // draw the "box" marks
  whiskerPlot.append("g")
    .attr("class", "estimates")
    .selectAll("line")
    .data(dataset)
    .enter()
    .append("line")
    .attr("x1", d => xScale(xValue(d)))
    .attr("y1", d => yScale(yValue(d)))
    .attr("x2", d => xScale(xValue(d)) + xScale.bandwidth())
    .attr("y2", d => yScale(yValue(d)))
    .style("stroke", d => color(d.Illiteracy));

  whiskerPlot.on("click", sortItems);

  // Flag for toggling the sort criterion for the bars
  let sortByCounty = true;

  /* Auxiliary function to sort the boxes/whiskers. */
  function sortItems() {
    // Check which sort criterion we are using
    const comparator = sortByCounty ?
      (a, b) => d3.ascending(a.County, b.County) :
      (a, b) => d3.ascending(a.Population, b.Population);

    // Update the vertical scale based on the sorted data
    xScale.domain(dataset.sort(comparator).map(d => d.County));

    // Re-draw the vertical axis
    whiskerPlot.select(".x.axis")
      .transition()
      .duration(1000)
      .call(d3.axisBottom().scale(xScale));

    // Sort the boxes by the new criterion
    whiskerPlot.selectAll(".upperbounds > line")
      .sort(comparator)
      .transition()
      .duration(1000)
      .attr("x1", d => xScale(xValue(d)))
      .attr("x2", d => xScale(xValue(d)) + xScale.bandwidth());
    whiskerPlot.selectAll(".lowerbounds > line")
      .sort(comparator)
      .transition()
      .duration(1000)
      .attr("x1", d => xScale(xValue(d)))
      .attr("x2", d => xScale(xValue(d)) + xScale.bandwidth());
    whiskerPlot.selectAll(".estimates > line")
      .sort(comparator)
      .transition()
      .duration(1000)
      .attr("x1", d => xScale(xValue(d)))
      .attr("x2", d => xScale(xValue(d)) + xScale.bandwidth());
    whiskerPlot.selectAll(".spreads > line")
      .sort(comparator)
      .transition()
      .duration(1000)
      .attr("x1", d => xScale(xValue(d)) + xScale.bandwidth() / 2)
      .attr("x2", d => xScale(xValue(d)) + xScale.bandwidth() / 2);

    // Keep track of which sort we just did
    sortByCounty = !sortByCounty;
  }
}

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
