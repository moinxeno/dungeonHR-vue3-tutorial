import { createPinia } from 'pinia'
import { createApp } from 'vue'

import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import './assets/main.css'

import App from './App.vue'
import router from './router'

createApp(App).use(createPinia()).use(router).mount('#app')
