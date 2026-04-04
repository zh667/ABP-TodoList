import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { TodoItemsRoutingModule } from './todo-items-routing.module';
import { TodoItemListComponent } from './todo-item-list/todo-item-list.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@NgModule({
  declarations: [TodoItemListComponent],
  imports: [SharedModule, TodoItemsRoutingModule, ReactiveFormsModule, FormsModule],
})
export class TodoItemsModule {}
