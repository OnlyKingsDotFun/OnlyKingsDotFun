import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import PrelaunchWorkspace from '../../upstream/raydium-ui-v3-public/src/features/Pots/PrelaunchWorkspace'
const root = document.getElementById('root')!
hydrateRoot(root, <PrelaunchWorkspace view={root.dataset.view || 'pots'} />)
