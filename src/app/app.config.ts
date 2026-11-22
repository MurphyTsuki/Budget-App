import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withInMemoryScrolling,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Adresses en #/... : fonctionne sur n'importe quel hébergement statique
      withHashLocation(),
      // Les paramètres d'adresse (:category, :account) arrivent directement dans les input() des pages
      withComponentInputBinding(),
      // Chaque changement de page remonte en haut
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    // PWA : l'appli s'installe et s'ouvre sans réseau (seulement dans la version compilée)
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
