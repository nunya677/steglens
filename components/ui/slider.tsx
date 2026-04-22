import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, value, defaultValue, onValueChange, ...props }, ref) => {
  // Ensure we consistently use an array for the Thumb mapping
  const values = Array.isArray(value) ? value : (defaultValue && Array.isArray(defaultValue) ? defaultValue : [value ?? 0])

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none items-center select-none py-4",
        className
      )}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full items-center">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[#222225]">
          <SliderPrimitive.Indicator className="absolute h-full bg-[#c5a47e] left-0" />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            className="block h-4 w-4 rounded-full border-2 border-[#c5a47e] bg-[#080809] ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing hover:scale-110 active:scale-95 duration-75"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
})
Slider.displayName = "Slider"

export { Slider }
