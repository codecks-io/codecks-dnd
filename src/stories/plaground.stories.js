import React from "react";
import {DragController, Draggable} from "..";

const Box = React.forwardRef(({id, ...rest}, ref) => (
  <div style={{width: 40, height: 40, background: "yellow"}} {...rest} ref={ref}>
    {id}
  </div>
));

const boxes = [1, 3, 6];

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
  </div>
);

export default {
  title: "Plaground/Simple",
  component: Playground,
};
