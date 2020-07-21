import Stats from 'https://unpkg.com/stats.js@0.17.0/src/Stats.js';

// import {GUI} from 'https://unpkg.com/dat.gui@0.7.7/build/dat.gui.module.js';

import { hyper } from './graph-utils.js';



const FORCE_LAYOUT_NODE_REPULSION_STRENGTH = 250;
const FORCE_LAYOUT_ITERATIONS = 1;

let graph;
let simulation;
let worker;
let sendTime; // Time when we sent last message
let delta = 1 / 60;
let width = 960, height = 600;

const stats = new Stats();
document.body.appendChild( stats.dom );
stats.dom.style.left = 'auto';
stats.dom.style.right = '0px';
stats.dom.style.top = 'auto';
stats.dom.style.bottom = '0px';

function render() { // time
  stats.begin();



  stats.end();

  requestAnimationFrame(render);
}

requestAnimationFrame(render);


let stage = new PIXI.Container();
let linksGfx;

let renderer = PIXI.autoDetectRenderer(width, height,
    { antialias: true, transparent: true, resolution: window.devicePixelRatio });
renderer.view.style.width = `${width}px`;

document.body.appendChild(renderer.view);

let colour = (function() {
    let scale = d3.scaleOrdinal(d3.schemeCategory10);
    return (num) => parseInt(scale(num).slice(1), 16);
})();

// let simulation = d3.forceSimulation()
//     .force('link', d3.forceLink().id((d) => d.id))
//     .force('charge', d3.forceManyBody())
//     .force('center', d3.forceCenter(width / 2, height / 2));

let gfxMap = {};

d3.json("https://gist.githubusercontent.com/mbostock/4062045/raw/5916d145c8c048a6e3086915a6be464467391c62/miserables.json")
.then(json => {
    graph = JSON.parse(JSON.stringify(json));

    graph = hyper(graph, 3);
    console.log(graph.nodes.length + ' nodes, ' + graph.links.length + ' links');

    linksGfx = new PIXI.Graphics();
    stage.addChild(linksGfx);

    graph.nodes.forEach((node) => {
      const gfx = new PIXI.Graphics();
      gfx.lineStyle(1.5, 0xFFFFFF);
      gfx.beginFill(colour(node.group));
      gfx.drawCircle(0, 0, 5);
      stage.addChild(gfx);
      gfxMap[node.id] = gfx;
    });

    d3.select(renderer.view)
        .call(d3.drag()
            .container(renderer.view)
            .subject(() => simulation.find(d3.event.x, d3.event.y))
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    const workerCode = `
      importScripts('https://unpkg.com/d3@5.12.0/dist/d3.min.js');

      let simulation;

      function forceLayout({ graph, options }) {
        const { nodes, links } = graph;
        const { iterations, nodeRepulsionStrength, width, height } = options;

        if(!simulation) {
          simulation = d3.forceSimulation()
            .alpha(0.25)
            .alphaDecay(0.005)
            .alphaTarget(0.025)
            ;

        }

        simulation
          .nodes(nodes)
          .force("link", d3.forceLink(links).id(d => d.id))
          .force("charge", d3.forceManyBody().strength(-nodeRepulsionStrength))
          .force('center', d3.forceCenter(width / 2, height / 2))
          // .stop()
          .tick(iterations);

        return graph;
      };

      self.onmessage = event => {
        // console.log('event.data', event.data);
        // const result = forceLayout.apply(undefined, event.data);
        const result = forceLayout(event.data);
        postMessage(result);
      }
    `;

    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob)
    worker = new Worker(workerUrl);

    worker.onmessage = event => {
      // worker.terminate();
      // URL.revokeObjectURL(workerUrl);

      // console.log(event.data);
      graph = event.data;
      ticked();

      // If the worker was faster than the time step (dt seconds), we want to delay the next timestep
      let delay = delta * 1000 - (Date.now() - sendTime);
      if(delay < 0) {
          delay = 0;
      }
      setTimeout(sendDataToWorker, delay);

    };

    sendDataToWorker();

});

function sendDataToWorker() {
    sendTime = Date.now();
    // worker.postMessage({
    //     N : N,
    //     dt : dt,
    //     cannonUrl : document.location.href.replace(/\/[^/]*$/,"/") + "../build/cannon.js",
    //     positions : positions,
    //     quaternions : quaternions
    // },[positions.buffer, quaternions.buffer]);
    worker.postMessage({
      graph,
      options: {
        iterations: FORCE_LAYOUT_ITERATIONS,
        nodeRepulsionStrength: FORCE_LAYOUT_NODE_REPULSION_STRENGTH,
        width,
        height,
      },
    });
}

function ticked() {

    graph.nodes.forEach((node) => {
        let { x, y } = node;
        gfxMap[node.id].position = new PIXI.Point(x, y);
    });

    linksGfx.clear();
    linksGfx.alpha = 0.6;

    graph.links.forEach((link) => {
        let { source, target } = link;
        linksGfx.lineStyle(Math.sqrt(link.value), 0x999999);
        linksGfx.moveTo(source.x, source.y);
        linksGfx.lineTo(target.x, target.y);
    });

    linksGfx.endFill();

    renderer.render(stage);

}

function dragstarted() {
    // if (!d3.event.active) simulation.alphaTarget(0.3).restart();
    d3.event.subject.fx = d3.event.subject.x;
    d3.event.subject.fy = d3.event.subject.y;
}

function dragged() {
    d3.event.subject.fx = d3.event.x;
    d3.event.subject.fy = d3.event.y;
}

function dragended() {
    // if (!d3.event.active) simulation.alphaTarget(0);
    d3.event.subject.fx = null;
    d3.event.subject.fy = null;
}
