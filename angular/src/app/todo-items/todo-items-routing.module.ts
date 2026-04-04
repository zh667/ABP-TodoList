import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { TodoItemListComponent } from './todo-item-list/todo-item-list.component';

const routes: Routes = [{ path: '', component: TodoItemListComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TodoItemsRoutingModule {}
