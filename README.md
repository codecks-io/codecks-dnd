# @codecks/dnd

## Installation

```bash
npm install @codecks/dnd
```

## Why?

Working with all kinds of dnd approaches for [Codecks](https://www.codecks.io), it became clear that native html-based drag and drop is still a big pain.

This library is inspired by [react-beautiful-dnd](https://github.com/atlassian/react-beautiful-dnd) but does things differently:

- only offering primitives, (i.e. no built-in reordering, no good accessibility story yet, PRs very welcome!). Thus, it's relatively small (< 7kb gzipped)
- only using Portals for dragged elements (to make a transition to virtualized lists more straight forward)

The library is meant as a substitute for the html-based drag and drop functionality offered via a fairly minimal react-based api.

## Usage

### `<Draggable>`

```js
import {DragController, Draggable} from "@codecks/dnd"

<DragController type="box" renderItem={({id}) => <Box id={id} />}>
  <div>
    {boxes.map((id) => (
      <Draggable type="box" id={id} key={id}>
        {({handlers, ref}) => <Box {...handlers} ref={ref} id={id} />}
      </Draggable>
    ))}
  </div>
</DragController>
```

`renderItem` is used for rendering the dragged item in a portal, so it's compatible with windowing-based lists.

It's using the render props pattern for the child so it can replace the content with a placeholder while dragging.

### `useDropZone`

```js
const DropZone = ({width = 200}) => {
  const {isOver, dragItem, ref} = useDropZone({
    type: "box",
    onDragOver: ({item, position}) => console.log("drag"),
    onDrop: ({item, position}) => console.log("drop!"),
  });

  return <div ref={ref}>Drop Here!</div>;
};
```

`onDragOver's` position will be null when the dragItem leaves the drop zone.

#### Todos:

- add pointer-events: none to everything (i.e. body) while dragging (to avoid hover effects, etc)
- drag file support?

#### License

Licensed under MIT
