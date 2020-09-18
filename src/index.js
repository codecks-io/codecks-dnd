import React from "react";
import {createPortal} from "react-dom";
import create from "zustand";
import ResizeObserver from "resize-observer-polyfill";

const Portal = ({children}) => {
  const [node] = React.useState(() => document.createElement("div"));
  React.useLayoutEffect(() => {
    document.body.appendChild(node);
    return () => document.body.removeChild(node);
  }, [node]);
  return node ? createPortal(children, node) : null;
};

const useDragStore = create((set) => ({
  item: null, // {type, id, data}
  dragInfo: null, // {startPos, currentPos, mouseOffset}
  dropFns: [],
  scrollNodes: [],
  scrollNodeCountMap: new Map(),
  addDropFn: (fn) => {
    set((prev) => ({dropFns: [fn, ...prev.dropFns]}));
    return () => set((prev) => ({dropFns: prev.dropFns.filter((f) => f !== fn)}));
  },
  registerScrollContainer: (nodes) => {
    set((prev) => {
      let listModified = false;
      const nextMap = new Map(prev.scrollNodeCountMap);
      nodes.forEach((node) => {
        const count = nextMap.get(node);
        if (count) {
          nextMap.set(node, count + 1);
        } else {
          listModified = true;
          nextMap.set(node, 1);
        }
      });
      if (listModified) {
        return {
          scrollNodeCountMap: nextMap,
          scrollNodes: [...nextMap.keys()].reverse(),
        };
      } else {
        return {scrollNodeCountMap: nextMap};
      }
    });
    return () =>
      set((prev) => {
        let listModified = false;
        const nextMap = new Map(prev.scrollNodeCountMap);
        nodes.forEach((node) => {
          const count = nextMap.get(node);
          if (count === 1) {
            nextMap.delete(node);
            listModified = true;
          } else {
            nextMap.set(node, count - 1);
          }
        });
        if (listModified) {
          return {
            scrollNodeCountMap: nextMap,
            scrollNodes: [...nextMap.keys()].reverse(),
          };
        } else {
          return {scrollNodeCountMap: nextMap};
        }
      });
  },
  set: ({item, dragInfo}) => set({item, dragInfo}),
  setItem: (item) => set({item}),
  setDragInfo: (dragInfo) => set((prev) => dragInfo(prev.dragInfo)),
}));

export const primaryButton = 0;
export const sloppyClickThreshold = 5;
const isSloppyClickThresholdExceeded = (original, current) =>
  Math.abs(current.x - original.x) >= sloppyClickThreshold ||
  Math.abs(current.y - original.y) >= sloppyClickThreshold;

const add = (p1, p2) => ({x: p1.x + p2.x, y: p1.y + p2.y});

const DragControllerCtx = React.createContext(() =>
  // eslint-disable-next-line no-console
  console.error("You need to wrap the Draggable wihtin a DragController")
);

let passiveArg = null;
const getPassiveArg = () => {
  if (passiveArg === null) {
    passiveArg = false;
    try {
      var opts = Object.defineProperty({}, "passive", {
        // eslint-disable-next-line getter-return
        get() {
          passiveArg = {passive: true};
        },
      });
      window.addEventListener("testPassive", null, opts);
      window.removeEventListener("testPassive", null, opts);
    } catch (e) {}
  }
  return passiveArg;
};

const useScrollContainerStore = create((set) => ({
  nodes: new Map(), // {[id]: {node, canScrollUp, canScrollDown, topRect, bottomRect}}
  activeScrollNode: null, // {id, node, intensity}
  setActiveScrollNode: (next) =>
    set(({activeScrollNode: prev}) => {
      // console.log({prev, next});
      if (next === null || prev === null) return {activeScrollNode: next};
      if (next.id === prev.id && prev.intensity === next.intensity) {
        return {activeScrollNode: prev};
      } else {
        return {activeScrollNode: next};
      }
    }),
  setNode: (id, info) =>
    set(({nodes, activeScrollNode}) => {
      const nextNodes = new Map(nodes);
      if (info === null) {
        nextNodes.delete(id);
        if (id === (activeScrollNode && activeScrollNode.id)) {
          return {nodes: nextNodes, activeScrollNode: null};
        }
      } else {
        if (typeof info === "function") {
          nextNodes.set(id, info(nodes.get(id)));
        } else {
          nextNodes.set(id, info);
        }
      }
      return {nodes: nextNodes};
    }),
}));

const getScrollInfo = (node) => {
  if (node === window) {
    return {
      canScrollUp: window.pageYOffset > 0,
      canScrollDown: window.innerHeight + window.pageYOffset < document.body.scrollHeight,
    };
  } else {
    return {
      canScrollUp: node.scrollTop > 0,
      canScrollDown: node.clientHeight + node.scrollTop < node.scrollHeight,
    };
  }
};

const ScrollListener = ({node, id}) => {
  const setNode = useScrollContainerStore((s) => s.setNode);
  React.useLayoutEffect(() => {
    const setRect = (rect) => {
      if (rect) {
        const scrollRectHeight = Math.min(
          100,
          Math.max(rect.height * 0.2, Math.min(rect.height * 0.5, 15))
        );
        const topRect = {
          ...rect,
          bottom: rect.top + scrollRectHeight,
          height: scrollRectHeight,
        };
        const bottomRect = {
          ...rect,
          top: rect.bottom - scrollRectHeight,
          height: scrollRectHeight,
        };
        setNode(id, {
          id,
          node,
          topRect,
          bottomRect,
          ...getScrollInfo(node),
        });
      } else {
        setNode(id, null);
      }
    };
    const {unsubFn} = getRectListener(node, setRect);

    const updateScroll = () => setNode(id, (prev) => ({...prev, ...getScrollInfo(node)}));
    node.addEventListener("scroll", updateScroll, getPassiveArg());

    return () => {
      unsubFn();
      node.removeEventListener("scroll", updateScroll, getPassiveArg());
    };
  }, [node, setNode, id]);
  return null;
};

const updateActiveScrollNode = (currentPos, nodes) => {
  const {setActiveScrollNode} = useScrollContainerStore.getState();
  for (const {id, node, canScrollUp, canScrollDown, topRect, bottomRect} of nodes.values()) {
    if (isWithin(currentPos, topRect)) {
      if (canScrollUp) {
        const relDistanceToTop = (currentPos.y - topRect.top) / topRect.height;
        const intensity = -Math.max(1, Math.ceil((1 - relDistanceToTop) * 6));
        setActiveScrollNode({id, node, intensity});
        return;
      }
    } else if (isWithin(currentPos, bottomRect)) {
      const relDistanceToBottom = (bottomRect.bottom - currentPos.y) / bottomRect.height;
      const intensity = Math.max(1, Math.ceil((1 - relDistanceToBottom) * 6));
      if (canScrollDown) {
        setActiveScrollNode({id, node, intensity});
        return;
      }
    }
  }
  setActiveScrollNode(null);
};

const ScrollListeners = () => {
  const scrollNodes = useDragStore((s) => s.scrollNodes);
  const activeScrollNode = useScrollContainerStore((s) => s.activeScrollNode);

  const momentumRef = React.useRef(0);

  React.useEffect(() => {
    if (!activeScrollNode) {
      momentumRef.current = 0;
      return;
    }
    const {node, intensity} = activeScrollNode;
    let nextRaf = null;
    const handleNextFrame = () => {
      nextRaf = requestAnimationFrame(() => {
        const currSpeed = Math.abs(momentumRef.current);
        const power = 1 + (Math.abs(intensity) - 3) / 50;
        const nextSpeed = Math.min(50, Math.max(2, currSpeed ** power));

        momentumRef.current = intensity < 0 ? -nextSpeed : nextSpeed;

        if (node === window) {
          window.scrollTo(0, window.pageYOffset + momentumRef.current);
        } else {
          node.scrollTop += momentumRef.current;
        }
        handleNextFrame();
      });
    };
    handleNextFrame();
    return () => {
      cancelAnimationFrame(nextRaf);
    };
  }, [activeScrollNode]);

  React.useEffect(() => {
    const unsubDragInfo = useDragStore.subscribe(
      (dragInfo) => {
        updateActiveScrollNode(dragInfo.currentPos, useScrollContainerStore.getState().nodes);
      },
      (state) => state.dragInfo
    );
    const unsubScrollInfo = useScrollContainerStore.subscribe(
      (nodes) => {
        updateActiveScrollNode(useDragStore.getState().dragInfo.currentPos, nodes);
      },
      (state) => state.nodes
    );
    return () => {
      unsubDragInfo();
      unsubScrollInfo();
    };
  }, []);
  return scrollNodes.map((node, id) => <ScrollListener key={id} id={id} node={node} />);
};

const DragElement = ({rect, children}) => {
  const setDragInfo = useDragStore((s) => s.setDragInfo);
  const set = useDragStore((s) => s.set);
  const nodeRef = React.useRef();

  React.useEffect(() => {
    const onMouseMove = (e) => {
      const point = {x: e.clientX, y: e.clientY};
      setDragInfo((prev) => ({
        dragInfo: {
          startPos: prev.startPos,
          mouseOffset: prev.mouseOffset,
          currentPos: add(point, prev.mouseOffset),
          dimensions: prev.dimensions,
        },
      }));
    };
    const onMouseUp = () => {
      const {dropFns, item} = useDragStore.getState();
      dropFns.some((fn) => fn({item}) !== false);
      set({item: null, setDragInfo: null});
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [set, setDragInfo]);

  React.useEffect(() => {
    return useDragStore.subscribe(
      (dragInfo) => {
        if (dragInfo) {
          if (nodeRef.current) {
            const x = dragInfo.currentPos.x - dragInfo.startPos.x;
            const y = dragInfo.currentPos.y - dragInfo.startPos.y;
            nodeRef.current.style.transform = `translate(${x}px, ${y}px)`;
          }
        }
      },
      (state) => state.dragInfo
    );
  }, []);

  return (
    <Portal>
      <div
        ref={nodeRef}
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          zIndex: 5000,
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      >
        {children}
      </div>
    </Portal>
  );
};

export const DragController = ({type, renderItem, children}) => {
  const set = useDragStore((s) => s.set);
  const dragItem = useDragStore((s) => (s.item && s.item.type === type ? s.item : null));
  const [dragItemRect, setDragItemRect] = React.useState(null);

  React.useEffect(() => {
    if (dragItemRect && !dragItem) {
      setDragItemRect(null);
    }
  }, [dragItem, dragItemRect]);

  const onHandleItemDragStart = React.useCallback(
    ({item, nodeRect, dragInfo: {startPos, currentPos}}) => {
      setDragItemRect(nodeRect);
      const centerX = nodeRect.left + nodeRect.width / 2;
      const centerY = nodeRect.top + nodeRect.height / 2;
      const mouseOffset = {x: centerX - currentPos.x, y: centerY - currentPos.y};
      const dragInfo = {
        mouseOffset,
        startPos: add(startPos, mouseOffset),
        currentPos: add(currentPos, mouseOffset),
        dimensions: {width: nodeRect.width, height: nodeRect.height},
      };
      set({item, dragInfo});
    },
    [set]
  );
  return (
    <>
      {dragItemRect && dragItem && (
        <>
          <ScrollListeners />
          <DragElement rect={dragItemRect}>{renderItem(dragItem)}</DragElement>
        </>
      )}
      <DragControllerCtx.Provider value={onHandleItemDragStart}>
        {children}
      </DragControllerCtx.Provider>
    </>
  );
};

const Placeholder = ({children}) => {
  const dimensions = useDragStore((s) => s.dragInfo && s.dragInfo.dimensions);
  return <div style={dimensions}>{children}</div>;
};

const idleState = {state: "idle", data: null};

export const Draggable = ({type, id, itemData, children, renderPlaceholder}) => {
  const onItemDragStart = React.useContext(DragControllerCtx);
  const isDraggingMe = useDragStore((s) =>
    s.item && s.item.type === type && s.item.id === id ? true : false
  );

  const [dragState, setDragState] = React.useState(idleState);
  const nodeRef = React.useRef();

  const itemDataRef = React.useRef(itemData);
  React.useEffect(() => {
    itemDataRef.current = itemData;
  }, [itemData]);

  React.useLayoutEffect(() => {
    if (nodeRef.current && dragState.state === "started") {
      const rect = nodeRef.current.getBoundingClientRect();
      const {top, bottom, left, right, height, width} = rect;
      const nodeRect = {top, bottom, left, right, height, width};
      onItemDragStart({
        item: {id, type, data: itemDataRef.current},
        nodeRect,
        dragInfo: dragState.data,
      });
      setDragState(idleState);
    }
  }, [dragState, id, onItemDragStart, type]);

  const handlers = React.useMemo(() => {
    if (dragState.state === "idle") {
      return {
        onMouseDown: (e) => {
          if (e.defaultPrevented) return;
          if (e.button !== primaryButton) return;
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          setDragState({state: "pending", data: {startPos: {x: e.clientX, y: e.clientY}}});
        },
      };
    } else if (dragState.state === "pending") {
      const cancel = () => {
        setDragState(idleState);
      };
      return {
        onMouseMove: (e) => {
          if (e.button !== primaryButton) return;
          const point = {x: e.clientX, y: e.clientY};
          if (isSloppyClickThresholdExceeded(dragState.data.startPos, point)) {
            e.preventDefault();
            setDragState({
              state: "started",
              data: {startPos: dragState.data.startPos, currentPos: point},
            });
          }
        },
        onMouseUp: cancel,
        onMouseDown: cancel,
      };
    }
  }, [dragState]);
  if (isDraggingMe) {
    return <Placeholder>{renderPlaceholder ? renderPlaceholder() : null}</Placeholder>;
  } else {
    return children({handlers, ref: nodeRef});
  }
};

const isWithin = (point, rect) =>
  point.x >= rect.left &&
  point.x <= rect.left + rect.width &&
  point.y >= rect.top &&
  point.y <= rect.top + rect.height;

const getScrollParents = (node) => {
  const parents = [];
  let currNode = node;
  while ((currNode = currNode.parentElement)) {
    const overflowYVal = window.getComputedStyle(currNode, null).getPropertyValue("overflow-y");
    if (overflowYVal === "auto" || overflowYVal === "scroll" || currNode === document.body) {
      parents.push(currNode === document.body ? window : currNode);
    }
  }
  return parents;
};

const getRectListener = (node, setRect) => {
  const unsubs = [];
  const update = () => {
    if (node === window) {
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      setRect({top: 0, left: 0, width, height, bottom: height, right: width});
    } else {
      const rect = node.getBoundingClientRect();
      const {top, bottom, left, right, width, height} = rect;
      setRect({top, bottom, left, right, width, height});
    }
  };
  const scrollParents = getScrollParents(node);
  scrollParents.forEach((parent) => {
    parent.addEventListener("scroll", update, getPassiveArg());
    unsubs.push(() => parent.removeEventListener("scroll", update, getPassiveArg()));
  });
  if (node !== window) {
    const ro = new ResizeObserver(update);
    ro.observe(node);
    unsubs.push(() => ro.disconnect());
  }

  window.addEventListener("resize", update);
  unsubs.push(() => window.removeEventListener("resive", update));

  update();

  return {
    unsubFn: () => {
      unsubs.forEach((fn) => fn());
      setRect(null);
    },
    scrollParents,
  };
};

const getRelPosition = (rect, pos) => ({
  x: pos.x - rect.left,
  y: pos.y - rect.top,
});

export const useDropZone = ({type, onDragOver, onDrop}) => {
  const nodeRef = React.useRef();
  const dragItem = useDragStore((s) => (s.item && s.item.type === type ? s.item : null));
  const addDropFn = useDragStore((s) => s.addDropFn);
  const registerScrollContainer = useDragStore((s) => s.registerScrollContainer);
  const [rect, setRect] = React.useState(null);
  const isOver = useDragStore((s) =>
    rect && s.dragInfo && isWithin(s.dragInfo.currentPos, rect) ? true : false
  );

  const onDropRef = React.useRef(onDrop);
  React.useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  const onDragRef = React.useRef(onDragOver);
  React.useEffect(() => {
    onDragRef.current = onDragOver;
  }, [onDragOver]);

  const rectRef = React.useRef(rect);
  React.useEffect(() => {
    rectRef.current = rect;
  }, [rect]);

  const lastOverRef = React.useRef(isOver);
  React.useEffect(() => {
    if (lastOverRef.current !== isOver) {
      if (!isOver) {
        // fire leave event
        if (onDragRef.current) onDragRef.current({item: dragItem, position: null});
      } else {
        // fire enter event
        if (onDragRef.current) {
          const {dragInfo} = useDragStore.getState();
          const position = getRelPosition(rectRef.current, dragInfo.currentPos);
          onDragRef.current({item: dragItem, position});
        }
      }
    }
    lastOverRef.current = isOver;
  }, [isOver, dragItem]);

  const hasOnDragCb = !!onDragOver;

  React.useEffect(() => {
    if (hasOnDragCb && dragItem) {
      return useDragStore.subscribe(
        (currentPos) => {
          if (currentPos && rectRef.current && onDragRef.current) {
            if (isWithin(currentPos, rectRef.current)) {
              const position = getRelPosition(rectRef.current, currentPos);
              onDragRef.current({item: dragItem, position});
            }
          }
        },
        (state) => state.dragInfo && state.dragInfo.currentPos
      );
    }
  }, [dragItem, hasOnDragCb]);

  React.useEffect(() => {
    if (isOver) {
      return addDropFn(({item}) => {
        const {dragInfo} = useDragStore.getState();
        const position = getRelPosition(rectRef.current, dragInfo.currentPos);
        onDropRef.current && onDropRef.current({item, position});
      });
    }
  }, [isOver, addDropFn]);

  React.useLayoutEffect(() => {
    if (dragItem && nodeRef.current) {
      const {unsubFn, scrollParents} = getRectListener(nodeRef.current, setRect);
      const unsubScrollContainers = registerScrollContainer(scrollParents);
      return () => {
        unsubFn();
        unsubScrollContainers();
      };
    }
  }, [dragItem, registerScrollContainer]);

  return {ref: nodeRef, dragItem, isOver};
};
