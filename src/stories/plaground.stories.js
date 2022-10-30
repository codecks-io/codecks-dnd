/* eslint-disable no-console */
import React from "react";
import {DragController, Draggable, useDropZone} from "..";

const Box = React.forwardRef(({id, style, ...rest}, ref) => (
  <div style={{width: 40, height: 40, background: "yellow", ...style}} {...rest} ref={ref}>
    {id}
  </div>
));

const boxes = [1, 3, 6];

const DropArea = ({width = 200}) => {
  const {isOver, ref} = useDropZone({
    type: "box",
    onDrop: (data) => console.log("drop!", data),
    onDragOver: (data) => console.log("dragY", data.position?.y),
  });

  return <div style={{width, height: 100, background: isOver ? "blue" : "red"}} ref={ref} />;
};

export const Playground = () => (
  <div>
    <DragController type="box" renderItem={({id}) => <Box id={id} />}>
      <div style={{display: "flex"}}>
        {boxes.map((id) => (
          <Draggable type="box" id={id} key={id}>
            {({handlers, ref}) => <Box {...handlers} ref={ref} id={id} />}
          </Draggable>
        ))}
      </div>
    </DragController>
    <DropArea />
    <div style={{height: 10}} />
    <DropArea />
  </div>
);

export const DropZoneChangeSize = () => {
  const [width, setWidth] = React.useState(200);

  React.useEffect(() => {
    let id = setInterval(() => {
      setWidth(Math.round(100 + Math.random() * 200));
    }, 500);
    return () => clearInterval(id);
  });
  return (
    <div>
      <DragController type="box" renderItem={({id}) => <Box id={id} />}>
        <div style={{display: "flex"}}>
          {boxes.map((id) => (
            <Draggable type="box" id={id} key={id}>
              {({handlers, ref}) => <Box {...handlers} ref={ref} id={id} />}
            </Draggable>
          ))}
        </div>
      </DragController>
      <DropArea width={width} />
    </div>
  );
};

export const Scrollmania = () => (
  <div style={{display: "flex", height: "120vh"}}>
    <div>
      <DragController type="box" renderItem={({id}) => <Box id={id} />}>
        <div style={{display: "flex"}}>
          {boxes.map((id) => (
            <Draggable type="box" id={id} key={id}>
              {({handlers, ref}) => <Box {...handlers} ref={ref} id={id} />}
            </Draggable>
          ))}
        </div>
      </DragController>
      <DropArea />
    </div>
    <div style={{height: 300, overflow: "auto", background: "cyan", padding: 20}}>
      <div>Text</div>
      <DropArea width={50} />
      {Array.from(new Array(30)).map((_, i) => (
        <div key={i}>Text</div>
      ))}
      <DropArea width={50} />
      <div>Text</div>
    </div>
  </div>
);

export const ScrollmaniaWithOverlay = () => (
  <div style={{display: "flex", height: "120vh", position: "relative"}}>
    <div>
      <DragController type="box" renderItem={({id}) => <Box id={id} />}>
        <div style={{display: "flex"}}>
          {boxes.map((id) => (
            <Draggable type="box" id={id} key={id}>
              {({handlers, ref}) => <Box {...handlers} ref={ref} id={id} />}
            </Draggable>
          ))}
        </div>
      </DragController>
    </div>
    <div
      style={{height: 300, overflow: "auto", background: "cyan", padding: 20, marginTop: 30}}
      id="overflowParent"
    >
      {/* <div style={{marginTop: -60}} /> */}
      <DropArea width={50} />
      {Array.from(new Array(30)).map((_, i) => (
        <div key={i}>Text</div>
      ))}
      <div>Text</div>
    </div>
  </div>
);

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  title: "Plaground",
  component: Playground,
};
