import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {createPortal} from "react-dom";
import {create} from "zustand";
import {subscribeWithSelector} from "zustand/middleware";
import {mergeRefs} from "react-merge-refs";
import {compare} from "stacking-order";

const Portal = ({children}) => {
  const [node] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    document.body.appendChild(node);
    return () => document.body.removeChild(node);
  }, [node]);
  return node ? createPortal(children, node) : null;
};

let _styleEl = false;
const ensureStyleEl = () => {
  if (!_styleEl) {
    _styleEl = document.createElement("style");
    _styleEl.type = "text/css";
    const head = document.querySelector("head");
    head.append(_styleEl);
  }
  return _styleEl;
};

const useStyle = (rules) => {
  useEffect(() => {
    const el = ensureStyleEl();
    el.textContent = rules;
    return () => {
      el.textContent = "";
    };
  });
};

export const getIndexViaBinarySearch = (list, el, cmpFn) => {
  var m = 0;
  var n = list.length - 1;
  while (m <= n) {
    var k = (n + m) >> 1;
    var cmp = cmpFn(el, list[k]);
    if (cmp > 0) {
      m = k + 1;
    } else if (cmp < 0) {
      n = k - 1;
    } else {
      return k;
    }
  }
  return m;
};

const createDropZoneManager = () => {
  const dropZones = [];
  const cmpFn = (dz1, dz2) => (dz1 === dz2 ? 0 : compare(dz2.node, dz1.node));
  return {
    addDropZone: (dropZone) => {
      const targetIdx = getIndexViaBinarySearch(dropZones, dropZone, cmpFn);
      dropZones.splice(targetIdx, 0, dropZone);
      return () => {
        const idx = dropZones.indexOf(dropZone);
        dropZones.splice(idx, 1);
      };
    },
    update: (currentPos, wasDropped, dragItem) => {
      let found = currentPos === null;
      for (const dropZone of dropZones) {
        if (!found) {
          const rect = dropZone.getRect();
          if (rect && isWithin(currentPos, rect)) {
            if (wasDropped) {
              dropZone.onDrop(rect, currentPos, dragItem);
              dropZone.setOver(false);
            } else {
              dropZone.onDragOver(rect, currentPos);
              dropZone.setOver(true);
            }
            found = true;
            continue;
          }
        }
        dropZone.setOver(false);
      }
    },
  };
};

const dropZoneManager = createDropZoneManager();

export const useDragStore = create(
  subscribeWithSelector((set, get) => ({
    item: null, // {type, id, data}
    dragInfo: null, // {startPos, currentPos, mouseOffset, isTouch}
    scrollNodes: [],
    scrollNodeCountMap: new Map(),
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
            scrollNodes: Array.from(nextMap.keys()).reverse(),
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
              scrollNodes: Array.from(nextMap.keys()).reverse(),
            };
          } else {
            return {scrollNodeCountMap: nextMap};
          }
        });
    },
    set: ({item, dragInfo}) => {
      set({item, dragInfo});
      dropZoneManager.update(dragInfo?.currentPos ?? null);
    },
    setDragInfo: (dragInfo) => {
      set((prev) => dragInfo(prev.dragInfo));
      dropZoneManager.update(get().dragInfo?.currentPos ?? null);
    },
  }))
);

const primaryButton = 0;
const sloppyClickThreshold = 5;
const isSloppyClickThresholdExceeded = (original, current) =>
  Math.abs(current.x - original.x) >= sloppyClickThreshold ||
  Math.abs(current.y - original.y) >= sloppyClickThreshold;

const addPos = (p1, p2) => ({x: p1.x + p2.x, y: p1.y + p2.y});
const subPos = (p1, p2) => ({x: p1.x - p2.x, y: p1.y - p2.y});
const isWithin = (point, rect) =>
  point.x >= rect.left &&
  point.x <= rect.left + rect.width &&
  point.y >= rect.top &&
  point.y <= rect.top + rect.height;

const DragControllerCtx = createContext({
  onItemDragStart: () =>
    // eslint-disable-next-line no-console
    console.error("You need to wrap the Draggable within a DragController"),
  renderPlaceholder: () => null,
});

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

const getReversedNodes = (nodes) => {
  const vals = [...nodes.values()];
  vals.reverse();
  return vals;
};

const useScrollContainerStore = create(
  subscribeWithSelector((set) => ({
    nodes: new Map(), // {[id]: {node, canScrollUp, canScrollDown, topRect, bottomRect}}
    reverseNodes: [],
    activeScrollNode: null, // {id, node, intensity}
    setActiveScrollNode: (next) =>
      set(({activeScrollNode: prev}) => {
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
            return {
              nodes: nextNodes,
              activeScrollNode: null,
              reverseNodes: getReversedNodes(nextNodes),
            };
          }
        } else {
          const nextVal = typeof info === "function" ? info(nodes.get(id)) : info;
          nextNodes.set(id, nextVal);
        }
        return {nodes: nextNodes, reverseNodes: getReversedNodes(nextNodes)};
      }),
  }))
);

const getScrollInfo = (node) => {
  if (node === window) {
    return {
      canScrollUp: window.scrollY > 0,
      canScrollDown: window.innerHeight + window.scrollY < document.body.scrollHeight,
    };
  } else {
    return {
      canScrollUp: node.scrollTop > 0,
      canScrollDown: node.clientHeight + node.scrollTop < node.scrollHeight,
    };
  }
};

const ScrollListener = ({node, id}) => {
  useLayoutEffect(() => {
    const {setNode} = useScrollContainerStore.getState();
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
  }, [node, id]);
  return null;
};

const updateActiveScrollNode = (mousePos, nodes) => {
  const {setActiveScrollNode} = useScrollContainerStore.getState();
  for (const {id, node, canScrollUp, canScrollDown, topRect, bottomRect} of nodes) {
    if (isWithin(mousePos, topRect)) {
      if (canScrollUp) {
        const relDistanceToTop = (mousePos.y - topRect.top) / topRect.height;
        const intensity = -Math.max(1, Math.ceil((1 - relDistanceToTop) * 6));
        setActiveScrollNode({id, node, intensity});
        return;
      }
    } else if (isWithin(mousePos, bottomRect)) {
      const relDistanceToBottom = (bottomRect.bottom - mousePos.y) / bottomRect.height;
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

  const momentumRef = useRef(0);

  useEffect(() => {
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
          window.scrollTo(0, window.scrollY + momentumRef.current);
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

  useEffect(() => {
    const unsubDragInfo = useDragStore.subscribe(
      (state) => state.dragInfo,
      (dragInfo) => {
        if (dragInfo) {
          updateActiveScrollNode(
            subPos(dragInfo.currentPos, dragInfo.mouseOffset),
            useScrollContainerStore.getState().reverseNodes
          );
        }
      }
    );
    const unsubScrollInfo = useScrollContainerStore.subscribe(
      (state) => state.reverseNodes,
      (reverseNodes) => {
        const {dragInfo} = useDragStore.getState();
        if (dragInfo) {
          updateActiveScrollNode(subPos(dragInfo.currentPos, dragInfo.mouseOffset), reverseNodes);
        }
      }
    );
    return () => {
      unsubDragInfo();
      unsubScrollInfo();
    };
  }, []);
  return scrollNodes.map((node, id) => <ScrollListener key={id} id={id} node={node} />);
};

const DragElement = ({rect, children}) => {
  const nodeRef = useRef();

  useLayoutEffect(() => {
    const {
      setDragInfo,
      set,
      dragInfo: {isTouch},
    } = useDragStore.getState();
    const onMouseMove = (e) => {
      const point = {x: e.clientX, y: e.clientY};
      setDragInfo((prev) => ({
        dragInfo: prev && {
          ...prev,
          currentPos: addPos(point, prev.mouseOffset),
        },
      }));
    };
    const onTouchMove = (e) => {
      const t = e.touches[0];
      const point = {x: t.clientX, y: t.clientY};
      setDragInfo((prev) => ({
        dragInfo: prev && {
          ...prev,
          currentPos: addPos(point, prev.mouseOffset),
        },
      }));
      if (e.cancelable) e.preventDefault();
    };

    const onMouseUp = (e) => {
      const {dragInfo, item} = useDragStore.getState();
      if (dragInfo) {
        dropZoneManager.update(dragInfo.currentPos, true, item);
        set({item: null, dragInfo: null});
      }
      if (e.cancelable) e.preventDefault();
    };

    const onKeyDown = () => {
      set({item: null, dragInfo: null});
    };

    if (isTouch) {
      window.addEventListener("touchmove", onTouchMove, {passive: false, capture: true});
      document.addEventListener("touchend", onMouseUp);
      document.addEventListener("touchcancel", onMouseUp);
    } else {
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      if (isTouch) {
        window.removeEventListener("touchmove", onTouchMove, {passive: false, capture: true});
        document.removeEventListener("touchend", onMouseUp);
        document.removeEventListener("touchcancel", onMouseUp);
      } else {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    return useDragStore.subscribe(
      (state) => state.dragInfo,
      (dragInfo) => {
        if (dragInfo) {
          if (nodeRef.current) {
            const x = dragInfo.currentPos.x - dragInfo.startPos.x;
            const y = dragInfo.currentPos.y - dragInfo.startPos.y;
            nodeRef.current.style.transform = `translate(${x}px, ${y}px)`;
          }
        }
      }
    );
  }, []);

  useStyle(`
    body {cursor:grabbing;}
    body * {pointer-events: none !important}
  `);

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

export const useDragItem = (type) => {
  const layerKey = useLayer();
  return useDragStore((s) =>
    s.item && s.item.type === type && s.item.layerKey === layerKey ? s.item : null
  );
};

const DefaultPlaceholder = forwardRef((props, ref) => {
  const dimensions = useDragStore((s) => s.dragInfo && s.dragInfo.dimensions);
  return <div style={dimensions} ref={ref} />;
});

const LayerContext = createContext(null);
const useLayer = () => useContext(LayerContext);

export const DragController = ({
  type,
  renderItem,
  cancelDragOnUnmount,
  renderPlaceholder,
  layerKey,
  children,
}) => {
  // const set = useDragStore((s) => s.set);
  const dragItem = useDragStore((s) =>
    s.item && s.item.type === type && s.item.layerKey === (layerKey || null) ? s.item : null
  );
  const [dragItemRect, setDragItemRect] = useState(null);

  const renderPlaceholderRef = useRef(renderPlaceholder);
  useEffect(() => {
    renderPlaceholderRef.current = renderPlaceholder;
  }, [renderPlaceholder]);

  useEffect(() => {
    if (dragItemRect && !dragItem) {
      setDragItemRect(null);
    }
  }, [dragItem, dragItemRect]);

  useEffect(() => {
    if (cancelDragOnUnmount && dragItemRect) {
      return () => useDragStore.getState().set({item: null, dragInfo: null});
    }
  }, [cancelDragOnUnmount, dragItemRect]);

  const ctxVal = useMemo(
    () => ({
      onItemDragStart: ({item, nodeRect, dragInfo: {startPos, currentPos, isTouch}}) => {
        setDragItemRect(nodeRect);
        const centerX = nodeRect.left + nodeRect.width / 2;
        const centerY = nodeRect.top + nodeRect.height / 2;
        const mouseOffset = {x: centerX - currentPos.x, y: centerY - currentPos.y};
        const dragInfo = {
          mouseOffset,
          startPos: addPos(startPos, mouseOffset),
          currentPos: addPos(currentPos, mouseOffset),
          dimensions: {width: nodeRect.width, height: nodeRect.height},
          isTouch,
        };
        useDragStore.getState().set({item, dragInfo});
      },
      renderPlaceholder:
        renderPlaceholderRef.current || (({ref}) => <DefaultPlaceholder ref={ref} />),
    }),
    []
  );
  const baseComp = (
    <>
      {dragItemRect && dragItem && (
        <>
          <ScrollListeners />
          <DragElement rect={dragItemRect}>{renderItem(dragItem)}</DragElement>
        </>
      )}
      {layerKey ? (
        <LayerContext.Provider value={layerKey}>
          <DragControllerCtx.Provider value={ctxVal}>{children}</DragControllerCtx.Provider>
        </LayerContext.Provider>
      ) : (
        <DragControllerCtx.Provider value={ctxVal}>{children}</DragControllerCtx.Provider>
      )}
    </>
  );
  return layerKey ? (
    <LayerContext.Provider value={layerKey}>{baseComp}</LayerContext.Provider>
  ) : (
    baseComp
  );
};
const idleState = {state: "idle", data: null};

export const Draggable = ({type, id, itemData, children, disabled, mergeRef}) => {
  const {onItemDragStart, renderPlaceholder} = useContext(DragControllerCtx);
  const layerKey = useLayer();
  const isDraggingMe = useDragStore((s) =>
    s.item && s.item.type === type && s.item.layerKey === layerKey && s.item.id === id
      ? s.item
      : false
  );

  const [dragState, setDragState] = useState(idleState);
  const nodeRef = useRef();

  const passedRef = useMemo(() => {
    return mergeRef ? mergeRefs([nodeRef, mergeRef]) : nodeRef;
  }, [mergeRef]);

  const itemDataRef = useRef(itemData);
  useEffect(() => {
    itemDataRef.current = itemData;
  }, [itemData]);

  useLayoutEffect(() => {
    if (nodeRef.current && dragState.state === "started") {
      const rect = nodeRef.current.getBoundingClientRect();
      const {top, bottom, left, right, height, width} = rect;
      const nodeRect = {top, bottom, left, right, height, width};
      const rawData = itemDataRef.current;
      const data = typeof rawData === "function" ? rawData() : rawData;
      onItemDragStart({item: {id, type, data, layerKey}, nodeRect, dragInfo: dragState.data});
      setDragState(idleState);
    }
  }, [dragState, id, onItemDragStart, type, layerKey]);

  const handlers = useMemo(() => {
    switch (dragState.state) {
      case "idle": {
        if (disabled) return {};
        return {
          onMouseDown: (e) => {
            if (e.defaultPrevented) return;
            if (e.button !== primaryButton) return;
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            setDragState({state: "pending", data: {startPos: {x: e.clientX, y: e.clientY}}});
          },
          // onTouchStart: (e) => {
          //   if (e.defaultPrevented) return;
          //   const t = e.touches[0];
          //   const pos = {x: t.clientX, y: t.clientY};
          //   let timeoutId = setTimeout(() => {
          //     setDragState({
          //       state: "started",
          //       data: {startPos: pos, currentPos: pos, isTouch: true},
          //     });
          //     if (navigator.vibrate) {
          //       try {
          //         navigator.vibrate(50);
          //       } catch {}
          //     }
          //   }, 100);
          //   setDragState({
          //     state: "pendingTouch",
          //     data: {startPos: pos, timeoutId},
          //   });
          // },
        };
      }
      case "pending": {
        const cancel = () => {
          setDragState(idleState);
        };
        if (disabled) {
          cancel();
          return {};
        }
        return {
          onMouseMove: (e) => {
            if (e.button !== primaryButton) return;
            const point = {x: e.clientX, y: e.clientY};
            if (isSloppyClickThresholdExceeded(dragState.data.startPos, point)) {
              e.preventDefault();
              setDragState({
                state: "started",
                data: {startPos: dragState.data.startPos, currentPos: point, isTouch: false},
              });
            }
          },
          onMouseUp: cancel,
          onMouseDown: cancel,
        };
      }
      // case "pendingTouch": {
      //   const cancel = () => {
      //     setDragState(idleState);
      //     clearTimeout(dragState.data.timeoutId);
      //   };
      //   return {
      //     onTouchMove: (e) => {
      //       const t = e.touches[0];
      //       const point = {x: t.clientX, y: t.clientY};
      //       if (isSloppyClickThresholdExceeded(dragState.data.startPos, point)) {
      //         cancel();
      //       } else {
      //         e.preventDefault();
      //       }
      //     },
      //     onTouchStart: cancel,
      //     onTouchEnd: cancel,
      //     onTouchCancel: cancel,
      //   };
      // }
      default:
        return {};
    }
  }, [dragState, disabled]);

  // child needs to stay present, even if placeholder is shown, to ensure that touch events
  // continue to be processed
  // rendering two children leads to other breaking changes. thus it's being reverted.

  // still not perfect, same issue is dicussed here:
  // - https://github.com/atlassian/react-beautiful-dnd/issues/2111
  // - https://github.com/atlassian/react-beautiful-dnd/compare/v12.0.0-beta.10...v12.0.0-beta.11

  return isDraggingMe
    ? renderPlaceholder({item: isDraggingMe, ref: passedRef})
    : children({handlers, ref: passedRef});
};

const getScrollParents = (node) => {
  const parents = [];
  let currNode = node;
  while ((currNode = currNode.parentElement)) {
    const overflowYVal = window.getComputedStyle(currNode, null).getPropertyValue("overflow-y");
    const isBody = currNode === document.body;
    if (overflowYVal === "auto" || overflowYVal === "scroll" || isBody) {
      parents.push(isBody ? window : currNode);
    }
  }
  return parents;
};

const intersectWithParents = (childRect, scrollParents) => {
  let {top, bottom, left, right} = childRect;
  let invisibleTop = 0;
  let invisibleLeft = 0;
  scrollParents.forEach((parent) => {
    if (parent === window) return;
    const pRect = parent.getBoundingClientRect();
    const nextTop = Math.max(pRect.top, top);
    invisibleTop += nextTop - top;
    top = nextTop;
    const nextLeft = Math.max(pRect.left, left);
    invisibleLeft += nextLeft - left;
    top = nextTop;
    right = Math.min(pRect.right, right);
    bottom = Math.min(pRect.bottom, bottom);
  });
  return {top, bottom, left, right, invisibleTop, invisibleLeft};
};

const getRectListener = (node, setRect) => {
  const unsubs = [];
  const scrollParents = getScrollParents(node);
  const update = () => {
    if (node === window) {
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      setRect({top: 0, left: 0, width, height, bottom: height, right: width});
    } else {
      const rect = node.getBoundingClientRect();
      const {top, bottom, left, right, invisibleTop, invisibleLeft} = intersectWithParents(
        rect,
        scrollParents
      );
      setRect({
        top,
        bottom,
        left,
        right,
        width: right - left,
        height: bottom - top,
        invisibleTop,
        invisibleLeft,
      });
    }
  };
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
  unsubs.push(() => window.removeEventListener("resize", update));

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
  x: pos.x - rect.left + rect.invisibleLeft,
  y: pos.y - rect.top + rect.invisibleTop,
});

const createAtom = (initialVal = null) => {
  let atom = initialVal;
  let subscriber = null;
  return {
    get: () => atom,
    set: (val) => {
      if (val !== atom) {
        atom = val;
        if (subscriber) subscriber(val);
      }
    },
    // only meant for a single subscriber
    subscribe: (subFn) => {
      subscriber = subFn;
      return () => {
        subscriber = null;
      };
    },
  };
};

// Updating the rect shouldn't cause a re-render of the drop zone and all its children.
// So `setState` is not an option
const useRect = ({dragItem, disabled, node}) => {
  const [rectAtom] = useState(createAtom);

  useLayoutEffect(() => {
    if (!disabled && dragItem && node) {
      const {unsubFn, scrollParents} = getRectListener(node, rectAtom.set);
      const {registerScrollContainer} = useDragStore.getState();
      const unsubScrollContainers = registerScrollContainer(scrollParents);
      return () => {
        unsubFn();
        unsubScrollContainers();
      };
    }
  }, [dragItem, disabled, node, rectAtom]);

  return {getRect: rectAtom.get, rectSubscribe: rectAtom.subscribe};
};

export const useDropZone = ({type, onDragOver, onDrop, disabled}) => {
  const [node, setNode] = useState(null);
  const dragItem = useDragItem(type);
  const [isOver, setOver] = useState(false);
  const {getRect, rectSubscribe} = useRect({dragItem, disabled, node});

  const refs = useRef({onDrop, onDragOver, isOver});
  useEffect(() => {
    refs.current = {onDrop, onDragOver, isOver};
  });

  useEffect(() => {
    if (!node || disabled) return;
    const unsubManag = dropZoneManager.addDropZone({
      node,
      getRect,
      onDrop: (rect, currentPos, item) => {
        if (!refs.current.onDrop) return;
        const position = getRelPosition(rect, currentPos);
        refs.current.onDrop({item, position});
      },
      setOver: (next) => {
        if (refs.current.isOver && !next && refs.current.onDragOver) {
          refs.current.onDragOver({item: null, position: null});
        }
        setOver(next);
        // dropping causes this code to be run twice before the isOver could be updated,
        // so lets set it directly here
        refs.current.isOver = next;
      },
      onDragOver: (rect, currentPos) => {
        if (refs.current.onDragOver) {
          const position = getRelPosition(rect, currentPos);
          refs.current.onDragOver({item: useDragStore.getState().item, position});
        }
      },
    });
    const unsubRect = rectSubscribe(() => {
      const {dragInfo} = useDragStore.getState();
      if (dragInfo) dropZoneManager.update(dragInfo.currentPos);
    });
    return () => {
      unsubManag();
      unsubRect();
    };
  }, [node, getRect, disabled, rectSubscribe]);

  return {ref: setNode, dragItem, isOver};
};
