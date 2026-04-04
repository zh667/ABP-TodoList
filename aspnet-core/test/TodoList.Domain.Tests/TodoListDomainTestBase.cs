using Volo.Abp.Modularity;

namespace TodoList;

/* Inherit from this class for your domain layer tests. */
public abstract class TodoListDomainTestBase<TStartupModule> : TodoListTestBase<TStartupModule>
    where TStartupModule : IAbpModule
{

}
