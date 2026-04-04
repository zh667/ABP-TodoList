using Xunit;

namespace TodoList.EntityFrameworkCore;

[CollectionDefinition(TodoListTestConsts.CollectionDefinitionName)]
public class TodoListEntityFrameworkCoreCollection : ICollectionFixture<TodoListEntityFrameworkCoreFixture>
{

}
