# @cdx/dnd

## Installation

```bash
npm install @cdx/dnd
```



Phases
- idling
- pendingDrag
- lifting?
- dragging
- dropping
- cancelling

Features
- drop into
- reorder
- multi drag
  - drag prop isDragged/isCoDragged (isCoDragged, stays where it is, get different style)
- file drop
- auto scroll


for mouse events:
https://github.com/atlassian/react-beautiful-dnd/blob/master/src/view/use-sensor-marshal/sensors/use-mouse-sensor.js

general styles for all kinds of elements in all kinds of situations...
https://github.com/atlassian/react-beautiful-dnd/blob/master/src/view/use-style-marshal/get-styles.js

draggable style:
https://github.com/atlassian/react-beautiful-dnd/blob/master/src/view/draggable/get-style.js

Implementation Considerations:
- add pointer-events: none to everything (i.e. body) while dragging (to avoid hover effects, etc)
- Drop areas only need active listeners if appropriate element is dragged
- drop areas don't care for mouse position but for center of drag el: no events on droppables, just calc their positions (constantly?) and use that info
- the drop area get onDrop handler
- draggable will get re-mounted on drop into different list (or for virtual lists?)
- while dragging, all els (incl. placeholder) stay where they are. Reshuffling only via tranforms!
- using portal while dragging,
  portal style:
  ```css
    .el {
      position: fixed;
      top: 0px;
      left: 195px;
      box-sizing: border-box;
      width: 300px;
      height: 78px;
      transition: opacity 0.2s cubic-bezier(0.2, 0, 0, 1) 0s;
      z-index: 5000;
      pointer-events: none;
      transform: translate(6px, 103px);
    }
    ```
  placeholder style:
   ```css
    .placeholder {
        display: block;
        box-sizing: border-box;
        width: 300px;
        height: 78px;
        margin: 0px 0px 8px;
        flex-shrink: 0;
        flex-grow: 0;
        pointer-events: none;
    }
  ```
