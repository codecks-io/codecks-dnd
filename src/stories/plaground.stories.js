import React from "react";
import {DragController, Draggable} from "..";

const Box = React.forwardRef((props, ref) => (
  <div style={{width: 40, height: 40, background: "yellow"}} {...props} ref={ref} />
));

export const Playground = () => (
  <div>
    <DragController type="box" renderItem={() => <Box />}>
      <div>
        <Draggable type="box" id="1">
          {({handlers, ref}) => <Box {...handlers} ref={ref} />}
        </Draggable>
      </div>
    </DragController>
  </div>
);

export default {
  title: "Plaground/Simple",
  component: Playground,
};
