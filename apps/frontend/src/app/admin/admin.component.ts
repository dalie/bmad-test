import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Admin Panel</h1>
    <p>Coming in stories 7-2 through 7-4.</p>`,
})
export class AdminComponent {}
