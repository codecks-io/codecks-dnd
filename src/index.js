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
  dragInfo: null, // {startPos, currentPos, node, bounds}
  set: ({item, dragInfo}) => set({item, dragInfo}),
  setItem: (item) => set({item}),
  setDragInfo: (dragInfo) => set((prev) => dragInfo(prev)),
}));

export const primaryButton = 0;
export const sloppyClickThreshold = 5;
const isSloppyClickThresholdExceeded = (original, current) =>
  Math.abs(current.x - original.x) >= sloppyClickThreshold ||
  Math.abs(current.y - original.y) >= sloppyClickThreshold;

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
      setDragInfo((prev) => ({dragInfo: {startPos: prev.dragInfo.startPos, currentPos: point}}));
    };
    const onMouseUp = () => {
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
  const dragItem = useDragStore((s) => s.item);
  const [dragItemRect, setDragItemRect] = React.useState(null);

  React.useEffect(() => {
    if (dragItemRect && !dragItem) {
      console.log("no more item can remove portal");
      setDragItemRect(null);
    }
  }, [dragItem, dragItemRect]);

  const onHandleItemDragStart = React.useCallback(
    ({item, nodeRect, dragInfo}) => {
      if (type !== item.type) return;
      setDragItemRect(nodeRect);
      set({item, dragInfo});
    },
    [set, type]
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

const idleState = {state: "idle", data: null};

export const Draggable = ({type, id, itemData, children}) => {
  const onItemDragStart = React.useContext(DragControllerCtx);
  const dragItem = useDragStore((s) => s.item);
  const [dragState, setDragState] = React.useState(idleState);
  const [node, setNode] = React.useState(null);
  const isDraggingMe = dragItem && dragItem.type === type && dragItem && dragItem.id === id;

  // console.log(dragState);

  const itemDataRef = React.useRef(itemData);
  React.useEffect(() => {
    itemDataRef.current = itemData;
  }, [itemData]);

  React.useLayoutEffect(() => {
    if (node && dragState.state === "started") {
      const rect = node.getBoundingClientRect();
      const {top, bottom, left, right, height, width} = rect;
      const nodeRect = {top, bottom, left, right, height, width};
      onItemDragStart({
        item: {id, type, data: itemDataRef.current},
        nodeRect,
        dragInfo: dragState.data,
      });
      setDragState(idleState);
    }
  }, [dragState, id, node, onItemDragStart, type]);

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
    return <div>PLACEHOLDER</div>;
  } else {
    return children({handlers, ref: setNode});
  }
};
