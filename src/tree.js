
import { select } from 'd3-selection';
import { hierarchy, tree } from 'd3-hierarchy';
import { max } from 'd3-array';
import { scaleLog } from 'd3-scale';

import { html as svg } from '@redsift/d3-rs-svg';
import { 
  brand,
  display,
  highlights,
  fonts,
  widths
} from '@redsift/d3-rs-theme';

const DEFAULT_SIZE = 800;
const DEFAULT_ASPECT = 1.0;
const DEFAULT_MARGIN = 16;
const DEFAULT_TEXT_SCALE = 8.39; // hack value to do fast estimation of length of string
const DEFAULT_NODE_RADIUS = 5.0;
const TINY = 1e-6;
const DEFAULT_TEXT_PADDING = 5;

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
export function mapChildren(source, child) {
  let data = hierarchy(source, child);

  let maxS = 0;
  let minZ = undefined,
      maxZ = undefined;
  let i = 0;

  data.each(d => {
    d.hasChildren = d.children && d.children.length > 0 ? true : false;
    d.id = ++i;
    let s = d.data.name.length;
    if (d.depth === data.height && s > maxS) {
      maxS = s;
    }
    let z = d.data.value;
    if (minZ == null) {
      minZ = z;
    } else if (z < minZ) {
      minZ = z;
    }
    if (maxZ == null) {
      maxZ = z;
    } else if (z > maxZ) {
      maxZ = z;
    }    
  });

  data.maxS = maxS;
  data.minZ = minZ;
  data.maxZ = maxZ;

  data.expand = (l) => {
    l = l || data.height;
    data.each(d => {
      if (d.depth < l) {
        if (d._children) {
          d.children = d._children;
          d._children = null;
        }
      }
    });
    return data;
  };

  data.collapse = (l) => {
    l = l || 1;
    data.eachAfter(d => {
      if (d.depth >= l) {
        if (d.children) {
          d._children = d.children;
          d.children = null;
        }
      }
    });
    return data;
  };

  return data;
}  

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
      msize = DEFAULT_TEXT_SCALE,
      nodeRadius = DEFAULT_NODE_RADIUS,
      nodeFill = null,
      nodeClass = null;
  
  function _impl(context) {
    let selection = context.selection ? context.selection() : context,
        transition = (context.selection !== undefined);

  
    let _background = background;
    if (_background === undefined) {
      _background = display[theme].background;
    }
            
    let _nodeClass = nodeClass;
    if (typeof(_nodeClass) !== 'function') {
      _nodeClass = () => nodeClass;
    }

    let _nodeFill = nodeFill;
    if (_nodeFill == null) {
      _nodeFill = (d) => d.children || d.hasChildren ? brand.standard[brand.names.green] : null;
    } else if (typeof(_nodeFill) !== 'function') {
      _nodeFill = () => nodeFill;
    }

    selection.each(function() {
      let node = select(this);  

      let her = node.datum() || {};

      let sh = height || Math.round(width * DEFAULT_ASPECT);
      if (pixelsPerNode > 0) { // auto compute height
        let pad = margin.top + margin.bottom;
        if (isNaN(pad)) {
          pad = margin * 2;
        }

        let levelWidth = [ 1 ];
        const childCount = (level, n) => {
          if (n.children && n.children.length > 0) {
              if (levelWidth.length <= level + 1) levelWidth.push(0);
              levelWidth[level + 1] += n.children.length;
              n.children.forEach(function(d) {
                  childCount(level + 1, d);
              });
            }
        }
        childCount(0, her);
                
        sh = max(levelWidth) * pixelsPerNode + pad;  
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

      
      let _nodeRadius = nodeRadius;
      if (typeof(_nodeRadius) !== 'function') {
        if (Array.isArray(nodeRadius)) {
          let log = () => nodeRadius[0];
          if (her.minZ != null && her.maxZ != null) {
            log = scaleLog().domain([her.minZ, her.maxZ]).range(nodeRadius).clamp(true);
          }
          _nodeRadius = (d) => log(d.data.value || 0);
        } else {
          _nodeRadius = () => nodeRadius;
        }
      }
      scaleLog()

      // estimate with msize
      let trees = tree().size([h, w - (her.maxS * msize)]);

      let treeData = trees(her);
    
      // Compute the new tree layout.
      let nodes = treeData.descendants(),
          links = treeData.descendants().slice(1);
      let i = 0;
      let gNode = g.selectAll('g.node').data(nodes, (d, i) => d.id || i);
      
      // Enter any new nodes at the parent's previous position.
      let nodeEnter = gNode.enter().append('g')
          .attr('class', 'node')
          .attr('transform', d => `translate(${d.y},${d.x})`);
      
      nodeEnter.append('circle').attr('r', TINY);
    
      nodeEnter.append('text')
          .attr('x', d => d.children || d.hasChildren ? -(_nodeRadius(d) + DEFAULT_TEXT_PADDING) : _nodeRadius(d) + DEFAULT_TEXT_PADDING)
          .attr('dy', d => d.id == 1 ? -10 : 0)
          .attr('alignment-baseline', d => d.id == 1 ? 'ideographic' : 'middle')
          .attr('text-anchor', d => d.id == 1 ? 'start' : d.children || d.hasChildren ? 'end' : 'start')
          .text(d => d.data.name)
          .style('fill-opacity', TINY);
    
      // Transition nodes to their new position.
      let nodeUpdate = nodeEnter.merge(gNode);
      if (onClick) {    
        nodeUpdate.on('click', onClick);
      }
      if (transition === true) {
        nodeUpdate = nodeUpdate.transition(context);
      }

      nodeUpdate.attr('transform', d => `translate(${d.y},${d.x})`);
    
      nodeUpdate.select('circle')
          .attr('r', _nodeRadius)
          .attr('class', _nodeClass)
          .style('fill', _nodeFill);
    
      nodeUpdate.select('text')
          .text(d => d.data.name) // not abosutely required
          .style('fill-opacity', 1);
    
      // Transition exiting nodes to the parent's new position.
      let nodeExit = gNode.exit();
      if (transition === true) {
        nodeExit = nodeExit.transition(context);
      }

      nodeExit
          .attr('transform', d => `translate(${d.parent ? d.parent.y : her.y},${d.parent ? d.parent.x : her.x})`)
          .remove();
    
      // On exit reduce the node circles size to 0
      nodeExit.select('circle').attr('r', TINY);

      // On exit reduce the opacity of text labels
      nodeExit.select('text').style('fill-opacity', TINY);

      // Update the links...
      let link = g.selectAll('path.link').data(links, (d, i) => d.id || i);

      // Enter any new links at the parent's previous position.
      let linkEnter = link.enter().insert('path', 'g')
          .attr('class', 'link')
          .attr('d', d => {
            let o = {
              x: d.parent ? d.parent.x0 : her.x0, 
              y: d.parent ? d.parent.y0 : her.y0
            };
            return diagonal(o, o)
          })
          .style('stroke-opacity', TINY);

      // UPDATE
      let linkUpdate = linkEnter.merge(link);
      if (transition === true) {
        linkUpdate = linkUpdate.transition(context);
      }

      // Transition back to the parent element position
      linkUpdate.attr('d', d => diagonal(d, d.parent))
        .style('stroke-opacity', 1.0);;

      // Remove any exiting links
      let linkExit = link.exit();
      if (transition === true) {
        linkExit = linkExit.transition(context);
      }

      linkExit.attr('d', d => {
          let o = {
                  x: d.parent ? d.parent.x : her.x, 
                  y: d.parent ? d.parent.y : her.y
                };
          return diagonal(o, o);
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
                    font-weight: ${fonts.fixed.weightMonochrome};  
                    fill: ${display[_theme].text}                
                  }

                  ${_impl.self()} .node circle {
                    fill: ${display[_theme].background};
                    stroke: ${display[_theme].axis};
                    stroke-width: ${widths.grid};
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
  
  _impl.onClick = function(value) {
    return arguments.length ? (onClick = value, _impl) : onClick;
  };   

  _impl.msize = function(value) {
    return arguments.length ? (msize = value, _impl) : msize;
  };   

  _impl.pixelsPerNode = function(value) {
    return arguments.length ? (pixelsPerNode = value, _impl) : pixelsPerNode;
  };   

  _impl.nodeRadius = function(value) {
    return arguments.length ? (nodeRadius = value, _impl) : nodeRadius;
  };  

  _impl.nodeFill = function(value) {
    return arguments.length ? (nodeFill = value, _impl) : nodeFill;
  };    

  _impl.nodeClass = function(value) {
    return arguments.length ? (nodeClass = value, _impl) : nodeClass;
  };   
  
  return _impl;
}