import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from "./components/sidebar/sidebar";
import { Topbar } from "./components/topbar/topbar";

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, Sidebar, Topbar],
  templateUrl: './app-layout.html',
})
export class AppLayout {


  
}
