// The two columns that fold away for more room: the app's sidebar (Ctrl+Shift+E, Cmd on macOS) and the editor's tree
// (Ctrl+B), kept folded or not from one start to the next.

import { readPref, writePref } from './prefs';

class Panels {
  sidebarHidden = $state(readPref('ui.sidebarHidden') === '1');
  treeHidden = $state(readPref('editor.treeHidden') === '1');

  toggleSidebar() {
    this.sidebarHidden = !this.sidebarHidden;
    writePref('ui.sidebarHidden', this.sidebarHidden ? '1' : '0');
  }

  toggleTree() {
    this.treeHidden = !this.treeHidden;
    writePref('editor.treeHidden', this.treeHidden ? '1' : '0');
  }
}

export const panels = new Panels();
