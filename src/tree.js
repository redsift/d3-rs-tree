
import { select } from 'd3-selection';
import { hierarchy, tree } from 'd3-hierarchy';
import { max } from 'd3-array';

import { html as svg } from '@redsift/d3-rs-svg';
import { 
  presentation10,
  display,
  highlights,
  fonts,
  widths
} from '@redsift/d3-rs-theme';

const DEFAULT_SIZE = 800;
const DEFAULT_ASPECT = 1.0;
const DEFAULT_MARGIN = 16;
const DEFAULT_LEGEND_TEXT_SCALE = 8.39; // hack value to do fast estimation of length of string

// Creates a curved (diagonal) path from parent to the child nodes
function diagonal(s, d) {
  if (s.x == null || s.y == null || d.x == null || d.y == null) {
    return ''
  }

  return `M ${s.y} ${s.x}
  C ${(s.y + d.y) / 2} ${s.x},
    ${(s.y + d.y) / 2} ${d.x},
    ${d.y} ${d.x}`
}
  
const TINY = 1e-6

export default function trees(id) {
  let classed = 'chart-tree', 
      theme = 'light',
      background = undefined,
      width = DEFAULT_SIZE,
      height = null,
      pixelsPerNode = 30,
      margin = DEFAULT_MARGIN,
      style = undefined,
      scale = 1.0,
      importFonts = true,
      onClick = null,
      msize = DEFAULT_LEGEND_TEXT_SCALE,
      duration = 666;
  
  let _background = background;
  if (_background === undefined) {
    _background = display[theme].background;
  }
  
  function _impl(context) {
    let selection = context.selection ? context.selection() : context,
        transition = (context.selection !== undefined);
    
    selection.each(function() {
      let node = select(this);  

      let source = node.datum() || {};

      let her = hierarchy(source, d =>  d.children);
      let levelWidth = [ 1 ];
      function childCount(level, n) {
        if (n.children && n.children.length > 0) {
            if (levelWidth.length <= level + 1) levelWidth.push(0);
            levelWidth[level + 1] += n.children.length;
            n.children.forEach(function(d) {
                childCount(level + 1, d);
            });
          }
      }

      let sh = height || Math.round(width * DEFAULT_ASPECT);
      if (pixelsPerNode > 0) { // auto compute height
        childCount(0, her);
        sh = max(levelWidth) * pixelsPerNode;  
      }
      
      // SVG element
      let sid = null;
      if (id) sid = 'svg-' + id;
      let root = svg(sid).width(width).height(sh).margin(margin).scale(scale).background(_background);
      let tnode = node;
      if (transition === true) {
        tnode = node.transition(context);
      }
    
      let w = root.childWidth(),
          h = root.childHeight();        
      let _style = style;
      if (_style === undefined) {
        // build a style sheet from the embedded charts
        _style = [ _impl ].filter(c => c != null).reduce((p, c) => p + c.defaultStyle(theme, w), '');
      }    

      root.style(_style);
      tnode.call(root);

      let snode = node.select(root.self());
      let elmS = snode.select(root.child());

      let g = elmS.select(_impl.self())
      if (g.empty()) {
        g = elmS.append('g').attr('class', classed).attr('id', id);
      }
      
      // try and compute how much padding will be required for a fully expanded text label
      let maxS = 0;      
      her.each(d => { 
        let s = d.data.name.length;
        if (s > maxS) {
          maxS = s;
        }
      });      

      // estimate with msize
      let trees = tree().size([h, w - (maxS * msize)]);

      let treeData = trees(her);
    
      // Compute the new tree layout.
      let nodes = treeData.descendants(),
          links = treeData.descendants().slice(1);

      let i = 0;
      let gNode = g.selectAll('g.node').data(nodes, d => d.id || (d.id = ++i));
      
      // Enter any new nodes at the parent's previous position.
      let nodeEnter = gNode.enter().append('g')
          .attr('class', 'node')
          .attr('transform', d => `translate(${d.y},${d.x})`);
      
      if (onClick) {    
        nodeEnter.on('click', onClick);
      }

      nodeEnter.append('circle')
          .attr('r', 5)
          .attr('class', d => d._children ? 'hidden-children' : '' )
          .style('fill', function(d) { return d._children ? "lightsteelblue" : "#0f0"; });
    
      nodeEnter.append('text')
          .attr('x', d => d.children || d._children ? -10 : 10)
          .attr('dy', d => d.id == 1 ? -10 : 0)
          .attr('alignment-baseline', d => d.id == 1 ? 'ideographic' : 'middle')
          .attr('text-anchor', d => d.id == 1 ? 'start' : d.children || d._children ? 'end' : 'start')
          .text(d => d.data.name);
    
      // Transition nodes to their new position.
      let nodeUpdate = gNode.transition()
          .duration(duration)
          .attr('transform', d => `translate(${d.y},${d.x})`);
    
      nodeUpdate.select("circle")
          .attr("r", 4.5)
          .style("fill", function(d) { return d._children ? "lightsteelblue" : "#fff"; });
    
      nodeUpdate.select('text').style('fill-opacity', 1);
    
      // Transition exiting nodes to the parent's new position.
      let nodeExit = gNode.exit().transition()
          .duration(duration)
          .attr("transform", function(d) { return "translate(" + source.y + "," + source.x + ")"; })
          .remove();
    
      // On exit reduce the node circles size to 0
      nodeExit.select('circle').attr('r', TINY);

      // On exit reduce the opacity of text labels
      nodeExit.select('text').style('fill-opacity', TINY);

      // Update the links...
      let link = g.selectAll('path.link').data(links, d => d.id);

      // Enter any new links at the parent's previous position.
      let linkEnter = link.enter().insert('path', 'g')
          .attr('class', 'link')
          .attr('d', d => {
            let o = { x: source.x0, y: source.y0 }
            return diagonal(o, o)
          });

      // UPDATE
      let linkUpdate = linkEnter.merge(link);

      // Transition back to the parent element position
      linkUpdate.transition()
          .duration(duration)
          .attr('d', d => diagonal(d, d.parent));

      // Remove any exiting links
      let linkExit = link.exit().transition()
          .duration(duration)
          .attr('d', d => {
            let o = {x: source.x, y: source.y}
            return diagonal(o, o)
          })
          .remove();

      // Store the old positions for transition.
      nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    });
    
  }
  
  _impl.self = function() { return 'g' + (id ?  '#' + id : '.' + classed); }

  _impl.id = function() {
    return id;
  };

  _impl.defaultStyle = (_theme, _width) => `
                  ${_impl.importFonts() ? fonts.fixed.cssImport : ''}
                  ${_impl.importFonts() ? fonts.variable.cssImport : ''}  
                  ${_impl.self()} text { 
                    font-family: ${fonts.variable.family};
                    font-size: ${fonts.variable.sizeForWidth(_width)};                
                  }

                  ${_impl.self()} .node circle {
                    stroke: ${display[_theme].axis};
                    stroke-width: ${widths.outline};
                  }

                  ${_impl.self()} .link {
                    fill: none;
                    stroke: ${display[_theme].grid};
                    stroke-width: ${widths.axis};
                  }
                `;
  
  _impl.importFonts = function(value) {
    return arguments.length ? (importFonts = value, _impl) : importFonts;
  };

  _impl.classed = function(value) {
    return arguments.length ? (classed = value, _impl) : classed;
  };
    
  _impl.background = function(value) {
    return arguments.length ? (background = value, _impl) : background;
  };

  _impl.theme = function(value) {
    return arguments.length ? (theme = value, _impl) : theme;
  };  

  _impl.size = function(value) {
    return arguments.length ? (width = value, height = null, _impl) : width;
  };
    
  _impl.width = function(value) {
    return arguments.length ? (width = value, _impl) : width;
  };  

  _impl.height = function(value) {
    return arguments.length ? (height = value, _impl) : height;
  }; 

  _impl.scale = function(value) {
    return arguments.length ? (scale = value, _impl) : scale;
  }; 

  _impl.margin = function(value) {
    return arguments.length ? (margin = value, _impl) : margin;
  };   

  _impl.style = function(value) {
    return arguments.length ? (style = value, _impl) : style;
  }; 

  _impl.duration = function(value) {
    return arguments.length ? (duration = value, _impl) : duration;
  }; 
  
  _impl.onClick = function(value) {
    return arguments.length ? (onClick = value, _impl) : onClick;
  };   

  _impl.msize = function(value) {
    return arguments.length ? (msize = value, _impl) : msize;
  };   

  _impl.pixelsPerNode = function(value) {
    return arguments.length ? (pixelsPerNode = value, _impl) : pixelsPerNode;
  };   
  
  return _impl;
}