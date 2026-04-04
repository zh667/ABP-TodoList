using TodoList.Samples;
using Xunit;

namespace TodoList.EntityFrameworkCore.Applications;

[Collection(TodoListTestConsts.CollectionDefinitionName)]
public class EfCoreSampleAppServiceTests : SampleAppServiceTests<TodoListEntityFrameworkCoreTestModule>
{

}
