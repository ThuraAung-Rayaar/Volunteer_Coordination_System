/**
 * @format
 */

import React from 'react';
import { ComponentGalleryScreen } from '../shared/components/ComponentGalleryScreen';

/**
 * Temporary root screen rendering the interactive shared component gallery.
 * Serves as development preview until Prompt 4 mounts the side-drawer navigation shell.
 */
export function TemporaryRootScreen(): React.JSX.Element {
  return <ComponentGalleryScreen />;
}
