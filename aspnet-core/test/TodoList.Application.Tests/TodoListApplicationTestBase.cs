using Volo.Abp.Modularity;

namespace TodoList;

public abstract class TodoListApplicationTestBase<TStartupModule> : TodoListTestBase<TStartupModule>
    where TStartupModule : IAbpModule
{

}
