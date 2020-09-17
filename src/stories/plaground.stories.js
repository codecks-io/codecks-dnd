import React from "react";
import {DragController, Draggable, useDropZone} from "..";

const Box = React.forwardRef(({id, style, ...rest}, ref) => (
  <div style={{width: 40, height: 40, background: "yellow", ...style}} {...rest} ref={ref}>
    {id}
  </div>
));

const boxes = [1, 3, 6];

const DropArea = () => {
  const {isOver, ref} = useDropZone({type: "box", onDrop: (data) => console.log({drop: data})});

  return <div style={{width: 200, height: 100, background: isOver ? "blue" : "red"}} ref={ref} />;
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

export default {
  title: "Plaground/Simple",
  component: Playground,
};
