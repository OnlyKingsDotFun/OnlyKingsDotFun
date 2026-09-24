import React from 'react'
import { renderToString } from 'react-dom/server'
import PrelaunchWorkspace from '../../upstream/raydium-ui-v3-public/src/features/Pots/PrelaunchWorkspace'
export function render(view: string) { return renderToString(<PrelaunchWorkspace view={view} />) }
