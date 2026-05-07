import type { Block } from 'payload'

/**
 * TestimonialsSlider — page-builder block that pulls active Testimonials
 * (ordered by displayOrder) and renders them in a carousel.
 */
export const TestimonialsSlider: Block = {
  slug: 'testimonialsSlider',
  interfaceName: 'TestimonialsSliderBlock',
  labels: { singular: 'Testimonials Slider', plural: 'Testimonials Sliders' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: { description: 'Section heading shown above the slider.' },
    },
    {
      name: 'subheading',
      type: 'text',
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 10,
      admin: { description: 'Maximum number of testimonials to show.' },
    },
    {
      name: 'showRating',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Display the star rating when set on a testimonial.' },
    },
  ],
}
