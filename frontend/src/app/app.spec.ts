import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('renders the form and the idle counter', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Safe Cracker');
    expect(el.querySelector('input#combination')).not.toBeNull();
    expect(el.querySelector('.counter-value')?.textContent?.trim()).toBe('0');
  });

  it('rejects anything that is not exactly 10 digits', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    for (const bad of ['', '123', '12345678901', '12345abcde']) {
      app.combination.setValue(bad);
      expect(app.combination.invalid).toBe(true);
    }
    app.combination.setValue('0800666666');
    expect(app.combination.valid).toBe(true);
  });
});
