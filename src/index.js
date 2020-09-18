import React from "react";
import {createPortal} from "react-dom";
import create from "zustand";

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
  addDropFn: (fn) => {
    set((prev) => ({dropFns: [fn, ...prev.dropFns]}));
    return () => set((prev) => ({dropFns: prev.dropFns.filter((f) => f !== fn)}));
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
  });

  React.useEffect(
    () =>
      useDragStore.subscribe(
        (dragInfo) => {
          if (dragInfo && nodeRef.current) {
            const x = dragInfo.currentPos.x - dragInfo.startPos.x;
            const y = dragInfo.currentPos.y - dragInfo.startPos.y;
            nodeRef.current.style.transform = `translate(${x}px, ${y}px)`;
          }
        },
        (state) => state.dragInfo
      ),
    []
  );

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
        <DragElement rect={dragItemRect}>{renderItem(dragItem)}</DragElement>
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

const getScrollParents = (node) => {
  const parents = [];
  let offsetParent = node;
  while ((offsetParent = offsetParent.offsetParent)) {
    const overflowYVal = window.getComputedStyle(offsetParent, null).getPropertyValue("overflow-y");
    if (overflowYVal === "auto" || overflowYVal === "scroll" || offsetParent === document.body) {
      parents.push(offsetParent === document.body ? window : offsetParent);
    }
  }
  return parents;
};

const getRectListener = (node, setRect) => {
  const unsubs = [];
  const update = () => {
    const rect = node.getBoundingClientRect();
    const {top, bottom, left, right, width, height} = rect;
    setRect({top, bottom, left, right, width, height});
  };
  const scrollParents = getScrollParents(node);
  scrollParents.forEach((parent) => {
    parent.addEventListener("scroll", update, getPassiveArg());
    unsubs.push(() => parent.removeEventListener("scroll", update, getPassiveArg()));
  });
  const ro = new ResizeObserver(update);
  ro.observe(node);
  unsubs.push(() => ro.disconnect());

  window.addEventListener("resize", update);
  unsubs.push(() => window.removeEventListener("resive", update));

  update();

  return () => {
    unsubs.forEach((fn) => fn());
    setRect(null);
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
      return getRectListener(nodeRef.current, setRect);
    }
  }, [dragItem]);

  return {ref: nodeRef, dragItem, isOver};
};
