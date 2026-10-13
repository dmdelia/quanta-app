import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/web-e2e',
  timeout:45000,
  use:{baseURL:'http://127.0.0.1:1420/quanta-app/',viewport:{width:1280,height:840},trace:'retain-on-failure'},
  webServer:{command:'npm run preview -- --base=/quanta-app/',url:'http://127.0.0.1:1420/quanta-app/',reuseExistingServer:false},
  reporter:'list',
});
