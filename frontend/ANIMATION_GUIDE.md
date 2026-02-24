# Animation Guide

This project uses [Framer Motion](https://www.framer.com/motion/) for animations. We have created a set of reusable components and variants to ensure consistency and performance across the application.

## Core Concepts

- **Performance**: We primarily animate `opacity` and `transform` properties which are hardware accelerated.
- **Consistency**: Use the provided wrapper components instead of raw `motion.div` where possible to maintain consistent timing and easing.
- **Accessibility**: Animations should respect user preferences for reduced motion (handled by Framer Motion's default behavior, but keep it in mind).

## Reusable Components

Located in `src/components/animations/MotionComponents.tsx`.

### 1. Basic Entrance Animations

Use these components to wrap elements that should animate when they enter the viewport.

```tsx
import { FadeIn, SlideUp, ScaleIn } from '../components/animations/MotionComponents';

// Simple fade in
<FadeIn>
  <h1>Hello World</h1>
</FadeIn>

// Slides up from 20px down
<SlideUp>
  <Card />
</SlideUp>

// Scales up from 0.95
<ScaleIn>
  <Modal />
</ScaleIn>
```

### 2. Staggered Animations

Use `StaggerContainer` and `StaggerItem` to animate a list of items sequentially.

```tsx
import { StaggerContainer, StaggerItem } from '../components/animations/MotionComponents';

<StaggerContainer className="grid grid-cols-3 gap-4">
  {items.map(item => (
    <StaggerItem key={item.id}>
      <Card item={item} />
    </StaggerItem>
  ))}
</StaggerContainer>
```

**Note**: `StaggerContainer` renders a `div` by default. If you need to use it in a specific context (like a `ul`), you can pass `as={motion.ul}` if the component supported it, or just use the variants directly (see below).

### 3. Interactive Components

Use `HoverCard` or `Clickable` for interactive elements.

```tsx
import { HoverCard, Clickable } from '../components/animations/MotionComponents';

// Lifts up on hover
<HoverCard onClick={handleClick}>
  <div className="p-4 bg-white shadow">
    Content
  </div>
</HoverCard>

// Scales down slightly on tap/click
<Clickable>
  <button>Click Me</button>
</Clickable>
```

## Using Variants Directly

If you need more control or need to animate specific elements like table rows (`tr`), you can import the variants directly from `src/components/animations/variants.ts`.

```tsx
import { motion } from 'framer-motion';
import { staggerContainer, itemVariants } from '../components/animations/variants';

<ul>
  <motion.li
    variants={itemVariants}
    initial="initial"
    animate="animate"
  >
    Item
  </motion.li>
</ul>
```

### For Tables

```tsx
<table className="min-w-full">
  <motion.tbody
    variants={staggerContainer}
    initial="initial"
    animate="animate"
  >
    {rows.map(row => (
      <motion.tr key={row.id} variants={itemVariants}>
        <td>{row.name}</td>
      </motion.tr>
    ))}
  </motion.tbody>
</table>
```

## Page Transitions

Page transitions are handled in `UserLayout.tsx` using `AnimatePresence`.

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={location.pathname}
    initial="initial"
    animate="animate"
    exit="exit"
    variants={pageVariants}
  >
    <Outlet />
  </motion.div>
</AnimatePresence>
```

## Best Practices

1. **Avoid Layout Thrashing**: Don't animate `width`, `height`, `top`, `left` if possible. Use `transform: scale()` or `transform: translate()` instead.
2. **Use `layout` prop carefully**: The `layout` prop is powerful for list reordering but can be expensive. Use it only when necessary.
3. **Clean up**: `AnimatePresence` handles component unmounting cleanup automatically.

## Testing

To test animations:
1. Verify animations trigger on mount.
2. Verify hover states on interactive elements.
3. Verify page transitions occur when navigating.
4. Check performance in Chrome DevTools "Performance" tab (look for "Layout Shift" or excessive JS execution).
